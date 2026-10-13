(function () {
    let berufeTabs = [];
    let berufeRecipes = [];
    let allBerufeRecipes = [];
    let berufeSearchRecipesLoaded = false;
    let berufeSearchLoadPromise = null;
    let activeBerufeTabId = null;

    function canManageBerufe() {
        return typeof window.canManageBerufe === 'function' && window.canManageBerufe();
    }

    function setStatus(message, isError) {
        const status = document.getElementById('berufe-status');
        if (!status) return;
        status.textContent = message;
        status.hidden = !message;
        status.classList.toggle('cashbook-status-error', !!isError);
    }

    function renderBerufeTabs() {
        const nav = document.getElementById('berufe-subtabs');
        const form = document.getElementById('berufe-create-form');
        const title = document.getElementById('berufe-panel-title');
        const description = document.getElementById('berufe-panel-description');
        const panel = document.getElementById('berufe-panel');
        const recipeCreateArea = document.getElementById('berufe-recipe-create-area');
        if (!nav || !title || !description || !panel) return;

        const selectedTab = berufeTabs.find(tab => String(tab.id) === String(activeBerufeTabId));
        const isTemplate = !selectedTab;
        if (form) {
            const canManage = isTemplate && canManageBerufe();
            form.hidden = !canManage;
            form.style.display = canManage ? 'flex' : 'none';
        }

        nav.querySelectorAll('[data-berufe-row]').forEach(row => row.remove());
        const orderedTabs = [...berufeTabs].sort((first, second) =>
            String(first.name).localeCompare(String(second.name), 'de', { sensitivity: 'base' })
        );
        orderedTabs.forEach(tab => {
            const row = document.createElement('div');
            row.className = 'berufe-subtab-row';
            row.dataset.berufeRow = String(tab.id);

            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'berufe-subtab';
            button.setAttribute('role', 'tab');
            button.setAttribute('aria-controls', 'berufe-panel');
            button.setAttribute('aria-selected', String(String(tab.id) === String(activeBerufeTabId)));
            button.dataset.berufeTab = String(tab.id);
            button.id = `berufe-tab-${tab.id}`;
            button.textContent = tab.name;
            button.addEventListener('click', () => selectBerufeTab(String(tab.id)));
            row.appendChild(button);

            if (canManageBerufe()) {
                const deleteButton = document.createElement('button');
                deleteButton.type = 'button';
                deleteButton.className = 'berufe-subtab-delete';
                deleteButton.textContent = '×';
                deleteButton.setAttribute('aria-label', `Beruf-Untertab „${tab.name}“ löschen`);
                deleteButton.title = 'Untertab löschen';
                deleteButton.addEventListener('click', () => deleteBerufeTab(String(tab.id)));
                row.appendChild(deleteButton);
            }

            nav.appendChild(row);
        });

        nav.querySelectorAll('[data-berufe-tab]').forEach(button => {
            button.classList.toggle('active', button.dataset.berufeTab === String(activeBerufeTabId));
        });
        const parentButton = document.querySelector('.berufe-parent-tab');
        if (parentButton) {
            const expanded = document.getElementById('tab-berufe').classList.contains('active');
            parentButton.setAttribute('aria-expanded', String(expanded));
            nav.hidden = !expanded;
        }

        const activeTitle = isTemplate ? 'Vorlage' : selectedTab.name;
        title.textContent = activeTitle;
        panel.setAttribute('aria-labelledby', isTemplate ? 'berufe-nav-button' : `berufe-tab-${selectedTab.id}`);
        description.textContent = isTemplate
            ? 'Erstelle hier Rezepte und ordne sie einem Berufs-Untertab zu.'
            : `Rezepte für ${selectedTab.name}.`;
        if (recipeCreateArea) {
            recipeCreateArea.hidden = !isTemplate || !canEditBerufe();
        }
        updateRecipeDestinationOptions();
        renderBerufeRecipes();
    }

    function canEditBerufe() {
        return typeof window.canEditTab === 'function' && window.canEditTab('berufe');
    }

    function updateRecipeDestinationOptions() {
        const select = document.getElementById('berufe-recipe-destination');
        if (!select) return;
        const selectedId = select.value;
        select.replaceChildren();
        berufeTabs.forEach(tab => {
            const option = document.createElement('option');
            option.value = String(tab.id);
            option.textContent = tab.name;
            select.appendChild(option);
        });
        if (berufeTabs.some(tab => String(tab.id) === selectedId)) {
            select.value = selectedId;
        }
        select.disabled = !berufeTabs.length;
    }

    function renderBerufeRecipes() {
        const list = document.getElementById('berufe-recipes-list');
        if (!list) return;
        list.replaceChildren();

        if (activeBerufeTabId === null) {
            hideBerufeCraftingPanel();
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 4;
            cell.style.cssText = 'text-align: center; color: var(--text-muted); padding: 20px;';
            cell.textContent = berufeTabs.length
                ? 'Wähle oben den Ziel-Untertab aus, in dem das Rezept angezeigt werden soll.'
                : 'Erstelle zuerst einen Berufs-Untertab, damit du Rezepte zuordnen kannst.';
            row.appendChild(cell);
            list.appendChild(row);
            return;
        }

        const recipes = berufeRecipes
            .filter(recipe => String(recipe.berufe_tab_id) === String(activeBerufeTabId))
            .sort((first, second) => String(first.output_name).localeCompare(String(second.output_name), 'de'));
        if (!recipes.length) {
            hideBerufeCraftingPanel();
            const row = document.createElement('tr');
            const cell = document.createElement('td');
            cell.colSpan = 4;
            cell.style.cssText = 'text-align: center; color: var(--text-muted); padding: 20px;';
            cell.textContent = 'Keine Rezepte gefunden.';
            row.appendChild(cell);
            list.appendChild(row);
            return;
        }

        recipes.forEach(recipe => {
            const ingredientCell = document.createElement('td');
            const ingredientBox = document.createElement('div');
            ingredientBox.style.cssText = 'font-size: 0.9rem; line-height: 1.4; background: var(--panel-bg-blue); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color);';
            (recipe.ingredients || []).forEach(ingredient => {
                const line = document.createElement('div');
                line.style.marginBottom = '4px';
                const amount = document.createElement('strong');
                amount.textContent = `${ingredient.qty}x`;
                line.append('• ', amount, ` ${ingredient.name}`);
                ingredientBox.appendChild(line);
            });
            if (!recipe.ingredients?.length) {
                const empty = document.createElement('span');
                empty.style.cssText = 'color: var(--text-muted); font-style: italic;';
                empty.textContent = 'Keine Zutaten definiert';
                ingredientBox.appendChild(empty);
            }
            ingredientCell.appendChild(ingredientBox);

            const row = document.createElement('tr');
            const outputCell = document.createElement('td');
            const outputInfo = document.createElement('div');
            outputInfo.style.cssText = 'display: flex; flex-direction: column; gap: 6px;';
            const name = document.createElement('span');
            name.className = 'material-name';
            name.style.cssText = 'color: var(--accent-blue); font-size: 1.05rem;';
            name.textContent = recipe.output_name;
            const yieldInfo = document.createElement('div');
            yieldInfo.style.cssText = 'display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: var(--text-muted);';
            const recipeYield = document.createElement('span');
            recipeYield.append('Rezept-Ertrag: ');
            const recipeYieldAmount = document.createElement('strong');
            recipeYieldAmount.textContent = `${recipe.output_qty} Stk.`;
            recipeYield.appendChild(recipeYieldAmount);
            yieldInfo.appendChild(recipeYield);
            outputInfo.append(name, yieldInfo);
            outputCell.appendChild(outputInfo);

            const showRecipeCell = document.createElement('td');
            const showRecipeButton = document.createElement('button');
            showRecipeButton.type = 'button';
            showRecipeButton.className = 'btn btn-secondary';
            showRecipeButton.textContent = 'Rezept anzeigen';
            showRecipeButton.addEventListener('click', () => showBerufeCraftingPanel(recipe));
            showRecipeCell.appendChild(showRecipeButton);

            const actionsCell = document.createElement('td');
            const actions = document.createElement('div');
            actions.style.cssText = 'display: flex; gap: 8px;';
            const editButton = document.createElement('button');
            editButton.type = 'button';
            editButton.className = 'btn btn-secondary';
            editButton.style.cssText = 'height: 38px; font-size: 0.85rem;';
            editButton.textContent = 'Bearbeiten';
            editButton.addEventListener('click', () => editBerufeRecipe(recipe.id));
            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'btn btn-danger delete-action';
            deleteButton.dataset.permissionAction = 'delete';
            deleteButton.textContent = 'Löschen';
            deleteButton.addEventListener('click', () => deleteBerufeRecipe(recipe.id));
            actions.append(editButton, deleteButton);
            actionsCell.appendChild(actions);

            row.append(outputCell, ingredientCell, showRecipeCell, actionsCell);
            list.appendChild(row);
        });
    }

    async function ensureBerufeSearchRecipesLoaded() {
        if (berufeSearchRecipesLoaded) return;
        if (berufeSearchLoadPromise) return berufeSearchLoadPromise;

        berufeSearchLoadPromise = (async () => {
            const { data, error } = await window.supabaseClient
                .from('berufe_recipes')
                .select('id, berufe_tab_id, output_name, output_qty, ingredients')
                .order('output_name', { ascending: true });
            if (error) throw error;
            allBerufeRecipes = Array.isArray(data) ? data : [];
            berufeSearchRecipesLoaded = true;
        })();

        try {
            await berufeSearchLoadPromise;
        } finally {
            berufeSearchLoadPromise = null;
        }
    }

    async function searchBerufeRecipes() {
        const input = document.getElementById('berufe-recipe-search-input');
        const results = document.getElementById('berufe-recipe-search-results');
        if (!input || !results) return;
        const query = input.value.trim().toLocaleLowerCase('de');
        results.replaceChildren();
        results.hidden = !query;
        if (!query) return;

        try {
            await ensureBerufeSearchRecipesLoaded();
            if (input.value.trim().toLocaleLowerCase('de') !== query) return;
            const matchingRecipes = allBerufeRecipes.filter(recipe =>
                recipe.output_name.toLocaleLowerCase('de').includes(query)
            );
            if (!matchingRecipes.length) {
                const empty = document.createElement('p');
                empty.className = 'berufe-recipe-search-empty';
                empty.textContent = 'Keine passenden Rezepte gefunden.';
                results.appendChild(empty);
                return;
            }

            const table = document.createElement('table');
            const header = document.createElement('thead');
            const headerRow = document.createElement('tr');
            ['Endprodukt', 'Beruf', 'Aktion'].forEach(label => {
                const heading = document.createElement('th');
                heading.textContent = label;
                headerRow.appendChild(heading);
            });
            header.appendChild(headerRow);
            table.appendChild(header);

            const body = document.createElement('tbody');
            matchingRecipes.forEach(recipe => {
                const tab = berufeTabs.find(item => String(item.id) === String(recipe.berufe_tab_id));
                if (!tab) return;
                const row = document.createElement('tr');
                const recipeName = document.createElement('td');
                recipeName.textContent = recipe.output_name;
                const profession = document.createElement('td');
                profession.textContent = tab.name;
                const action = document.createElement('td');
                const openButton = document.createElement('button');
                openButton.type = 'button';
                openButton.className = 'btn btn-secondary';
                openButton.dataset.permissionView = 'true';
                openButton.textContent = 'Infopanel anzeigen';
                openButton.addEventListener('click', () => showBerufeCraftingPanel(recipe));
                action.appendChild(openButton);
                row.append(recipeName, profession, action);
                body.appendChild(row);
            });

            if (!body.childElementCount) {
                const empty = document.createElement('p');
                empty.className = 'berufe-recipe-search-empty';
                empty.textContent = 'Keine passenden Rezepte gefunden.';
                results.appendChild(empty);
                return;
            }
            table.appendChild(body);
            const tableContainer = document.createElement('div');
            tableContainer.className = 'table-container-scrollable';
            tableContainer.appendChild(table);
            results.appendChild(tableContainer);
        } catch (error) {
            console.error('Berufe-Rezeptsuche konnte nicht geladen werden:', error);
            setStatus('Die Rezeptsuche konnte nicht geladen werden. Bitte Supabase-Verbindung und Tabellenrechte prüfen.', true);
        }
    }

    function showBerufeCraftingPanel(recipe) {
        const panel = document.getElementById('berufe-crafting-action-box');
        const content = document.getElementById('berufe-crafting-action-content');
        if (!panel || !content) return;
        const targetAmount = recipe.output_qty;
        const productionSteps = [];
        const rawMaterials = {};

        function getRecipe(name) {
            return allBerufeRecipes.find(item =>
                String(item.berufe_tab_id) === String(recipe.berufe_tab_id)
                && item.output_name.toLowerCase() === name.toLowerCase()
            );
        }

        function resolveMaterials(itemName, neededQty, currentPath = []) {
            const matchedRecipe = getRecipe(itemName);
            const isCircular = currentPath.some(name => name.toLowerCase() === itemName.toLowerCase());
            if (!matchedRecipe || !matchedRecipe.ingredients?.length || matchedRecipe.output_qty <= 0 || isCircular) {
                rawMaterials[itemName] = (rawMaterials[itemName] || 0) + neededQty;
                return;
            }

            const multiplier = Math.ceil(neededQty / matchedRecipe.output_qty);
            const actualProduced = multiplier * matchedRecipe.output_qty;
            matchedRecipe.ingredients.forEach(ingredient => {
                resolveMaterials(ingredient.name, ingredient.qty * multiplier, [...currentPath, itemName]);
            });
            if (!productionSteps.some(step => step.itemName.toLowerCase() === matchedRecipe.output_name.toLowerCase())) {
                productionSteps.push({
                    itemName: matchedRecipe.output_name,
                    multiplier,
                    actualProduced,
                    ingredients: matchedRecipe.ingredients
                });
            }
        }

        resolveMaterials(recipe.output_name, targetAmount);
        content.replaceChildren();

        if (productionSteps.length <= 1) {
            const intro = document.createElement('div');
            intro.style.cssText = 'color: var(--text-muted); margin-bottom: 12px; font-size: 1rem;';
            intro.textContent = 'Dieses Produkt benötigt keine Zwischenschritte. Es setzt sich direkt aus Rohmaterialien zusammen:';
            content.appendChild(intro);
        } else {
            const heading = document.createElement('div');
            heading.style.cssText = 'font-size: 1rem; font-weight: 700; color: #f8fafc; margin-bottom: 12px;';
            heading.textContent = 'Zwischenschritte (von links nach rechts):';
            content.appendChild(heading);

            const stepsContainer = document.createElement('div');
            stepsContainer.style.cssText = 'display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 24px;';
            productionSteps
                .filter(step => step.itemName.toLowerCase() !== recipe.output_name.toLowerCase())
                .forEach((step, index) => {
                    const card = document.createElement('div');
                    card.style.cssText = 'background: var(--card-bg-raised); border: 1px solid var(--border-color); padding: 14px; border-radius: 8px; flex: 1; min-width: 240px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);';
                    const title = document.createElement('div');
                    title.style.cssText = 'font-weight: 700; color: var(--accent-blue); font-size: 0.95rem; margin-bottom: 6px; border-bottom: 1px solid var(--border-color); padding-bottom: 4px;';
                    title.textContent = `Schritt ${index + 1}: ${step.actualProduced}x ${step.itemName}`;
                    const materialsTitle = document.createElement('div');
                    materialsTitle.style.cssText = 'font-size: 0.85rem; color: var(--text-muted); margin-bottom: 4px;';
                    materialsTitle.textContent = 'Benötigte Materialien:';
                    card.append(title, materialsTitle);

                    step.ingredients.forEach(ingredient => {
                        const needed = ingredient.qty * step.multiplier;
                        const line = document.createElement('div');
                        line.style.cssText = 'margin-left: 8px; font-size: 0.85rem; margin-bottom: 2px;';
                        const amount = document.createElement('strong');
                        amount.textContent = `${needed}x`;
                        line.append('• ', amount, ` ${ingredient.name}`);
                        card.appendChild(line);
                    });
                    stepsContainer.appendChild(card);
                });
            content.appendChild(stepsContainer);
        }

        const rawBox = document.createElement('div');
        rawBox.style.cssText = 'background: var(--card-bg-raised); border: 2px solid var(--accent-green); padding: 16px; border-radius: 8px; margin-top: 12px;';
        const rawTitle = document.createElement('div');
        rawTitle.style.cssText = 'font-size: 1.1rem; font-weight: 700; color: var(--accent-green); margin-bottom: 10px;';
        rawTitle.textContent = `📦 Benötigte Rohmaterialien für ${targetAmount}x ${recipe.output_name}:`;
        rawBox.appendChild(rawTitle);

        Object.entries(rawMaterials).forEach(([materialName, quantity]) => {
            const line = document.createElement('div');
            line.style.cssText = 'margin-bottom: 4px; font-size: 0.95rem;';
            const amount = document.createElement('strong');
            amount.textContent = `${quantity}x`;
            line.append('• ', amount, ` ${materialName}`);
            rawBox.appendChild(line);
        });
        content.appendChild(rawBox);
        panel.style.display = 'block';
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    function hideBerufeCraftingPanel() {
        const panel = document.getElementById('berufe-crafting-action-box');
        if (panel) panel.style.display = 'none';
    }

    function isValidBerufeTabId(tabId) {
        return berufeTabs.some(tab => String(tab.id) === String(tabId));
    }

    function initBerufeRecipeInputs() {
        const container = document.getElementById('berufe-recipe-ingredients-container');
        if (!container) return;
        container.replaceChildren();
        addBerufeRecipeIngredientInput();
    }

    function addBerufeRecipeIngredientInput(container = document.getElementById('berufe-recipe-ingredients-container')) {
        if (!container) return;
        const row = document.createElement('div');
        row.className = 'recipe-ingredient-row';
        row.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-bottom: 8px;';

        const name = document.createElement('input');
        name.type = 'text';
        name.className = 'rec-ing-name';
        name.placeholder = 'Zutatenartikel';
        name.required = true;
        name.style.flex = '2';

        const quantity = document.createElement('input');
        quantity.type = 'number';
        quantity.className = 'rec-ing-qty';
        quantity.placeholder = 'Anzahl';
        quantity.min = '1';
        quantity.value = '1';
        quantity.required = true;
        quantity.style.cssText = 'flex: 1; max-width: 100px;';

        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn btn-danger';
        remove.textContent = '×';
        remove.title = 'Zutat entfernen';
        remove.style.height = '40px';
        remove.addEventListener('click', () => row.remove());

        row.append(name, quantity, remove);
        container.appendChild(row);
    }

    function editBerufeRecipe(recipeId) {
        if (!canEditBerufe()) return;
        const recipe = berufeRecipes.find(item => String(item.id) === String(recipeId));
        if (!recipe) return;

        const form = document.getElementById('berufe-recipe-add-form');
        document.getElementById('berufe-recipe-edit-id').value = recipe.id;
        document.getElementById('berufe-recipe-destination').value = String(recipe.berufe_tab_id);
        form.querySelector('.recipe-output-input').value = recipe.output_name;
        form.querySelector('.recipe-output-qty').value = recipe.output_qty;
        const ingredients = document.getElementById('berufe-recipe-ingredients-container');
        ingredients.replaceChildren();
        (recipe.ingredients || []).forEach(item => {
            const before = ingredients.childElementCount;
            addBerufeRecipeIngredientInput(ingredients);
            const row = ingredients.children[before];
            row.querySelector('.rec-ing-name').value = item.name;
            row.querySelector('.rec-ing-qty').value = item.qty;
        });
        if (!recipe.ingredients?.length) addBerufeRecipeIngredientInput(ingredients);

        document.getElementById('berufe-recipe-form-title').textContent = `Rezept bearbeiten: ${recipe.output_name}`;
        document.getElementById('berufe-recipe-form-summary').textContent = `✏️ Rezept bearbeiten: ${recipe.output_name}`;
        document.getElementById('berufe-recipe-submit-btn').textContent = 'Änderungen speichern';
        document.getElementById('berufe-recipe-cancel-btn').hidden = false;
        document.getElementById('berufe-recipe-details').open = true;
        form.querySelector('.recipe-output-input').focus();
    }

    function cancelBerufeRecipeEdit() {
        const form = document.getElementById('berufe-recipe-add-form');
        document.getElementById('berufe-recipe-edit-id').value = '';
        form.querySelector('.recipe-output-input').value = '';
        form.querySelector('.recipe-output-qty').value = '1';
        initBerufeRecipeInputs();
        document.getElementById('berufe-recipe-form-title').textContent = '+ Neues Rezept hinzufügen';
        document.getElementById('berufe-recipe-form-summary').textContent = '+ Neues Rezept hinzufügen';
        document.getElementById('berufe-recipe-submit-btn').textContent = 'Rezept speichern';
        document.getElementById('berufe-recipe-cancel-btn').hidden = true;
    }

    async function createBerufeRecipe(event) {
        event.preventDefault();
        if (!canEditBerufe()) {
            setStatus('Du hast keine Bearbeitungsrechte für Berufe-Rezepte.', true);
            return;
        }

        const form = event.currentTarget;
        const editId = document.getElementById('berufe-recipe-edit-id').value;
        const tabId = form.querySelector('#berufe-recipe-destination').value;
        const outputName = capitalizeText(form.querySelector('.recipe-output-input').value.trim());
        const outputQty = Number.parseInt(form.querySelector('.recipe-output-qty').value, 10);
        const ingredients = [...form.querySelectorAll('.recipe-ingredient-row')].map(row => ({
            name: capitalizeText(row.querySelector('.rec-ing-name').value.trim()),
            qty: Number.parseInt(row.querySelector('.rec-ing-qty').value, 10)
        })).filter(item => item.name && Number.isInteger(item.qty) && item.qty > 0);

        if (!isValidBerufeTabId(tabId)) {
            setStatus('Bitte wähle einen gültigen Berufs-Untertab aus.', true);
            return;
        }
        if (!outputName || !Number.isInteger(outputQty) || outputQty < 1 || !ingredients.length) {
            setStatus('Bitte Endprodukt, gültigen Ertrag und mindestens eine Zutat angeben.', true);
            return;
        }

        const saveButton = form.querySelector('[type="submit"]');
        saveButton.disabled = true;
        setStatus('', false);
        try {
            const query = editId
                ? window.supabaseClient.from('berufe_recipes').update({
                    berufe_tab_id: Number(tabId),
                    output_name: outputName,
                    output_qty: outputQty,
                    ingredients
                }).eq('id', editId)
                : window.supabaseClient.from('berufe_recipes').insert([{
                    berufe_tab_id: Number(tabId),
                    output_name: outputName,
                    output_qty: outputQty,
                    ingredients
                }]);
            const { data, error } = await query.select().single();
            if (error) throw error;
            if (!data) throw new Error('Supabase hat das gespeicherte Rezept nicht zurückgegeben.');

            berufeRecipes = berufeRecipes.filter(recipe => String(recipe.id) !== String(data.id));
            if (String(activeBerufeTabId) === String(data.berufe_tab_id)) berufeRecipes.push(data);
            if (berufeSearchRecipesLoaded) {
                allBerufeRecipes = allBerufeRecipes.filter(recipe => String(recipe.id) !== String(data.id));
                allBerufeRecipes.push(data);
            }
            renderBerufeRecipes();
            searchBerufeRecipes();
            cancelBerufeRecipeEdit();
            if (typeof window.logActivity === 'function') {
                const destination = berufeTabs.find(tab => String(tab.id) === String(tabId));
                await window.logActivity('Berufe', `Rezept „${outputName}“ für „${destination.name}“ ${editId ? 'bearbeitet' : 'erstellt'}`);
            }
            if (typeof window.showToast === 'function') {
                window.showToast(`Rezept „${outputName}“ wurde ${editId ? 'aktualisiert' : 'im ausgewählten Beruf gespeichert'}.`, 'success');
            }
        } catch (error) {
            console.error('Berufe-Rezept konnte nicht gespeichert werden:', error);
            const message = error && error.code === '23505'
                ? 'In diesem Berufs-Untertab gibt es bereits ein Rezept mit diesem Endprodukt.'
                : `Rezept konnte nicht gespeichert werden: ${error.message || 'Unbekannter Fehler'}`;
            setStatus(message, true);
            if (typeof window.showToast === 'function') window.showToast(message, 'danger');
        } finally {
            saveButton.disabled = false;
        }
    }

    async function deleteBerufeRecipe(recipeId) {
        if (!canEditBerufe()) return;
        const recipe = berufeRecipes.find(item => String(item.id) === String(recipeId));
        if (!recipe || typeof window.customConfirm !== 'function'
            || !await window.customConfirm(`Rezept „${recipe.output_name}“ wirklich löschen?`)) return;
        const { error } = await window.supabaseClient
            .from('berufe_recipes')
            .delete()
            .eq('id', recipeId);
        if (error) {
            console.error('Berufe-Rezept konnte nicht gelöscht werden:', error);
            setStatus(`Rezept konnte nicht gelöscht werden: ${error.message}`, true);
            return;
        }
        berufeRecipes = berufeRecipes.filter(item => String(item.id) !== String(recipeId));
        allBerufeRecipes = allBerufeRecipes.filter(item => String(item.id) !== String(recipeId));
        renderBerufeRecipes();
        searchBerufeRecipes();
        if (typeof window.logActivity === 'function') {
            await window.logActivity('Berufe', `Berufe-Rezept „${recipe.output_name}“ gelöscht`);
        }
        if (String(document.getElementById('berufe-recipe-edit-id').value) === String(recipeId)) {
            cancelBerufeRecipeEdit();
        }
    }

    async function loadBerufeRecipes(tabId) {
        if (!tabId) {
            berufeRecipes = [];
            renderBerufeRecipes();
            return;
        }
        const { data, error } = await window.supabaseClient
            .from('berufe_recipes')
            .select('id, berufe_tab_id, output_name, output_qty, ingredients')
            .eq('berufe_tab_id', tabId)
            .order('output_name', { ascending: true });
        if (error) {
            console.error('Berufe-Rezepte konnten nicht geladen werden:', error);
            setStatus('Rezepte für diesen Untertab konnten nicht geladen werden. Bitte Supabase-Setup prüfen.', true);
            return;
        }
        if (String(activeBerufeTabId) !== String(tabId)) return;
        berufeRecipes = Array.isArray(data) ? data : [];
        renderBerufeRecipes();
    }

    function setBerufeNavigationExpanded(expanded) {
        const nav = document.getElementById('berufe-subtabs');
        const parentButton = document.querySelector('.berufe-parent-tab');
        if (nav) nav.hidden = !expanded;
        if (parentButton) parentButton.setAttribute('aria-expanded', String(expanded));
    }

    function selectBerufeTab(tabId) {
        if (!berufeTabs.some(tab => String(tab.id) === String(tabId))) return;
        if (!document.getElementById('tab-berufe').classList.contains('active')) {
            if (typeof window.switchTab === 'function') window.switchTab('berufe');
        }
        activeBerufeTabId = tabId;
        hideBerufeCraftingPanel();
        renderBerufeTabs();
        loadBerufeRecipes(tabId);
    }

    function openBerufeNavigation() {
        if (typeof window.switchTab === 'function') window.switchTab('berufe');
        activeBerufeTabId = null;
        renderBerufeTabs();
    }

    async function loadBerufeTab() {
        const { data, error } = await window.supabaseClient
            .from('berufe_tabs')
            .select('id, name')
            .order('created_at', { ascending: true })
            .order('id', { ascending: true });
        if (error) {
            console.error('Berufe-Untertabs konnten nicht geladen werden:', error);
            setStatus('Berufe-Untertabs konnten nicht geladen werden. Bitte das Supabase-Setup prüfen.', true);
            renderBerufeTabs();
            return;
        }

        berufeTabs = Array.isArray(data) ? data : [];
        if (activeBerufeTabId !== null && !berufeTabs.some(tab => String(tab.id) === String(activeBerufeTabId))) {
            activeBerufeTabId = null;
        }
        setStatus('', false);
        renderBerufeTabs();
        if (activeBerufeTabId !== null) await loadBerufeRecipes(activeBerufeTabId);
    }

    async function createBerufeTab(event) {
        event.preventDefault();
        if (!canManageBerufe()) {
            setStatus('Nur Administratoren dürfen Berufe-Untertabs erstellen.', true);
            return;
        }

        const input = document.getElementById('berufe-new-tab-name');
        const button = document.getElementById('berufe-create-button');
        const name = input.value.trim();
        if (!name || name.length > 50) {
            setStatus('Bitte einen Namen mit höchstens 50 Zeichen eingeben.', true);
            return;
        }

        button.disabled = true;
        setStatus('Untertab wird erstellt ...', false);
        try {
            const { data, error } = await window.supabaseClient.rpc('berufe_create_tab', {
                p_name: name
            });
            if (error) throw error;

            const createdTab = Array.isArray(data) ? data[0] : data;
            if (!createdTab || createdTab.id === undefined) {
                throw new Error('Supabase hat keinen neu erstellten Untertab zurückgegeben.');
            }
            input.value = '';
            activeBerufeTabId = String(createdTab.id);
            await loadBerufeTab();
            if (typeof window.showToast === 'function') {
                window.showToast(`Der Untertab „${createdTab.name}“ wurde erstellt.`, 'success');
            }
            if (typeof window.logActivity === 'function') {
                await window.logActivity('Berufe', `Berufe-Untertab „${createdTab.name}“ erstellt`);
            }
        } catch (error) {
            console.error('Berufe-Untertab konnte nicht erstellt werden:', error);
            const message = error && (error.code === '23505' || (error.message && error.message.includes('already exists')))
                ? 'Ein Untertab mit diesem Namen existiert bereits.'
                : 'Untertab konnte nicht erstellt werden. Bitte Administratorrechte und Supabase-Setup prüfen.';
            setStatus(message, true);
            if (typeof window.showToast === 'function') window.showToast(message, 'danger');
        } finally {
            button.disabled = false;
        }
    }

    async function deleteBerufeTab(tabId) {
        if (!canManageBerufe()) {
            setStatus('Nur Administratoren dürfen Berufs-Untertabs löschen.', true);
            return;
        }

        const tab = berufeTabs.find(item => String(item.id) === String(tabId));
        if (!tab) {
            setStatus('Der Beruf-Untertab wurde nicht gefunden.', true);
            return;
        }
        if (typeof window.customConfirm !== 'function'
            || !await window.customConfirm(`Möchtest du den Beruf-Untertab „${tab.name}“ wirklich löschen?`)) {
            return;
        }

        try {
            const { data: deleted, error } = await window.supabaseClient.rpc('berufe_delete_tab', {
                p_tab_id: tab.id
            });
            if (error) throw error;
            if (!deleted) {
                setStatus('Der Beruf-Untertab wurde nicht gefunden oder bereits gelöscht.', true);
                return;
            }

            allBerufeRecipes = allBerufeRecipes.filter(recipe => String(recipe.berufe_tab_id) !== String(tabId));
            if (String(activeBerufeTabId) === String(tabId)) activeBerufeTabId = null;
            await loadBerufeTab();
            searchBerufeRecipes();
            if (typeof window.logActivity === 'function') {
                const logged = await window.logActivity('Berufe', `Berufe-Untertab „${tab.name}“ gelöscht`);
                if (!logged && typeof window.showToast === 'function') {
                    window.showToast('Der Untertab wurde gelöscht, aber die Aktion konnte nicht protokolliert werden.', 'danger');
                }
            }
        } catch (error) {
            console.error('Berufe-Untertab konnte nicht gelöscht werden:', error);
            setStatus('Beruf-Untertab konnte nicht gelöscht werden. Bitte Administratorrechte und Supabase-Setup prüfen.', true);
            if (typeof window.showToast === 'function') {
                window.showToast('Beruf-Untertab konnte nicht gelöscht werden.', 'danger');
            }
        }
    }

    window.loadBerufeTab = loadBerufeTab;
    window.selectBerufeTab = selectBerufeTab;
    window.openBerufeNavigation = openBerufeNavigation;
    window.setBerufeNavigationExpanded = setBerufeNavigationExpanded;
    window.createBerufeTab = createBerufeTab;
    window.deleteBerufeTab = deleteBerufeTab;
    window.addBerufeRecipeIngredientInput = addBerufeRecipeIngredientInput;
    window.createBerufeRecipe = createBerufeRecipe;
    window.editBerufeRecipe = editBerufeRecipe;
    window.deleteBerufeRecipe = deleteBerufeRecipe;
    window.cancelBerufeRecipeEdit = cancelBerufeRecipeEdit;
    window.hideBerufeCraftingPanel = hideBerufeCraftingPanel;
    window.addEventListener('DOMContentLoaded', () => {
        initBerufeRecipeInputs();
        const searchInput = document.getElementById('berufe-recipe-search-input');
        if (searchInput) searchInput.addEventListener('input', searchBerufeRecipes);
    });
})();
