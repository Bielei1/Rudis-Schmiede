(function () {
    let berufeTabs = [];
    let berufeRecipes = [];
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
            const multiplier = 1;
            const actualProduced = recipe.output_qty;
            const ingredientCell = document.createElement('td');
            const ingredientBox = document.createElement('div');
            ingredientBox.style.cssText = 'font-size: 0.9rem; line-height: 1.4; background: var(--panel-bg-blue); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color);';
            let allIngredientsOk = true;
            (recipe.ingredients || []).forEach(ingredient => {
                const stock = inventoryList.find(item => item.name.toLowerCase() === ingredient.name.toLowerCase())?.quantity || 0;
                const enough = stock >= ingredient.qty * multiplier;
                if (!enough) allIngredientsOk = false;
                const line = document.createElement('div');
                line.style.cssText = 'margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between; gap: 8px;';

                const required = document.createElement('span');
                required.append('• ');
                const requiredAmount = document.createElement('strong');
                requiredAmount.textContent = `${ingredient.qty * multiplier}x`;
                required.append(requiredAmount, ` ${ingredient.name}`);
                const stockInfo = document.createElement('span');
                stockInfo.style.cssText = 'font-size: 0.85rem; color: var(--text-muted);';
                const stockValue = document.createElement('span');
                stockValue.style.cssText = `color: ${stock === 0 ? 'var(--danger-color)' : (enough ? 'var(--accent-green)' : 'var(--accent-red)')}; font-weight: 600;`;
                stockValue.textContent = stock;
                stockInfo.append('(Lager: ', stockValue, ')');
                line.append(required, stockInfo);
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
            const result = document.createElement('div');
            result.style.cssText = 'font-size: 0.9rem; color: var(--accent-green); font-weight: 600;';
            result.textContent = `→ Daraus resultierender Ertrag: ${actualProduced} Stk. (${multiplier} Durchgänge)`;
            outputInfo.append(name, yieldInfo, result);
            outputCell.appendChild(outputInfo);

            const statusCell = document.createElement('td');
            const status = document.createElement('span');
            status.className = allIngredientsOk ? 'req-status status-ok' : 'req-status status-missing';
            status.textContent = allIngredientsOk ? '✓ Rohstoffe vorhanden' : '✕ Rohstoffe fehlen';
            statusCell.appendChild(status);

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

            row.append(outputCell, ingredientCell, statusCell, actionsCell);
            list.appendChild(row);
        });
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
            renderBerufeRecipes();
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
        renderBerufeRecipes();
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

            if (String(activeBerufeTabId) === String(tabId)) activeBerufeTabId = null;
            await loadBerufeTab();
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
    window.addEventListener('DOMContentLoaded', initBerufeRecipeInputs);
})();
