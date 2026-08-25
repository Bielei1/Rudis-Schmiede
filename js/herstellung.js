    function initRecipeIngredientInputs() {
        const container = document.getElementById('recipe-ingredients-container');
        if (!container) return;
        container.innerHTML = '';
        addRecipeIngredientInput("", "");
    }

    function addRecipeIngredientInput(defaultName = "", defaultQty = "") {
        const container = document.getElementById('recipe-ingredients-container');
        if (!container) return;
        const div = document.createElement('div');
        div.className = 'recipe-ingredient-row';
        div.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-bottom: 8px;';
        div.innerHTML = `
            <input type="text" class="rec-ing-name" placeholder="Zutatenartikel" value="${defaultName}" required style="flex:2;" />
            <input type="number" class="rec-ing-qty" placeholder="Anzahl" min="1" value="${defaultQty || 1}" required style="flex:1; max-width: 100px;" />
            <button type="button" class="btn btn-danger" onclick="this.parentElement.remove()" style="height: 40px;">✕</button>
        `;
        container.appendChild(div);
    }

    function editRecipe(id) {
        const recipe = recipesList.find(r => r.id === id);
        if (!recipe) return;

        document.getElementById('recipe-edit-id').value = recipe.id;
        document.getElementById('recipe-output-input').value = recipe.outputName;
        document.getElementById('recipe-output-qty').value = recipe.outputQty;

        const container = document.getElementById('recipe-ingredients-container');
        container.innerHTML = '';
        if (recipe.ingredients && recipe.ingredients.length > 0) {
            recipe.ingredients.forEach(ing => {
                addRecipeIngredientInput(ing.name, ing.qty);
            });
        } else {
            addRecipeIngredientInput();
        }

        document.getElementById('recipe-form-title').innerText = `Rezept bearbeiten: ${recipe.outputName}`;
        document.getElementById('recipe-form-summary').innerText = `✏️ Rezept bearbeiten: ${recipe.outputName}`;
        document.getElementById('recipe-submit-btn').innerText = 'Änderungen speichern';
        document.getElementById('recipe-cancel-btn').style.display = 'inline-flex';

        document.getElementById('recipe-details-card').open = true;
        document.getElementById('recipe-output-input').focus();
    }

    function cancelRecipeEdit() {
        document.getElementById('recipe-edit-id').value = '';
        document.getElementById('recipe-output-input').value = '';
        document.getElementById('recipe-output-qty').value = '1';
        initRecipeIngredientInputs();

        document.getElementById('recipe-form-title').innerText = '+ Neues Rezept hinzufügen';
        document.getElementById('recipe-form-summary').innerText = '+ Neues Rezept hinzufügen';
        document.getElementById('recipe-submit-btn').innerText = 'Rezept speichern';
        document.getElementById('recipe-cancel-btn').style.display = 'none';
    }

    async function handleAddRecipe(event) {
        event.preventDefault();
        const editId = document.getElementById('recipe-edit-id').value;
        const outputName = capitalizeText(document.getElementById('recipe-output-input').value.trim());
        const outputQty = parseInt(document.getElementById('recipe-output-qty').value, 10);

        if (!outputName || isNaN(outputQty) || outputQty < 1) return alert("Bitte gültiges Endprodukt und Ertrag eingeben.");

        const rows = document.querySelectorAll('.recipe-ingredient-row');
        const ingredients = [];

        rows.forEach(row => {
            const name = capitalizeText(row.querySelector('.rec-ing-name').value.trim());
            const qty = parseInt(row.querySelector('.rec-ing-qty').value, 10);
            if (name && !isNaN(qty) && qty > 0) ingredients.push({ name, qty });
        });

        if (ingredients.length === 0) return alert("Mindestens eine Zutat angeben.");

        if (editId) {
            const { error } = await supabaseClient
                .from('recipes')
                .update({ outputName, outputQty, ingredients })
                .eq('id', editId);

            if (!error) {
                const existing = recipesList.find(r => r.id == editId);
                if (existing) {
                    existing.outputName = outputName;
                    existing.outputQty = outputQty;
                    existing.ingredients = ingredients;
                }
                cancelRecipeEdit();
                logActivity('Rezept', `Rezept für "${outputName}" bearbeitet`);
            } else {
                alert("Fehler beim Aktualisieren: " + error.message);
            }
        } else {
            const existing = recipesList.find(r => r.outputName.toLowerCase() === outputName.toLowerCase());

            if (existing) {
                const { error } = await supabaseClient
                    .from('recipes')
                    .update({ outputQty, ingredients })
                    .eq('id', existing.id);

                if (!error) {
                    existing.outputQty = outputQty;
                    existing.ingredients = ingredients;
                    logActivity('Rezept', `Rezept für "${outputName}" aktualisiert`);
                }
            } else {
                const { data, error } = await supabaseClient
                    .from('recipes')
                    .insert([{ outputName, outputQty, ingredients }])
                    .select();

                if (!error && data) {
                    recipesList.push(data[0]);
                    logActivity('Rezept', `Neues Rezept für "${outputName}" angelegt`);
                }
            }
            document.getElementById('recipe-output-input').value = '';
            document.getElementById('recipe-output-qty').value = '1';
            initRecipeIngredientInputs();
        }

        updateRecipeSearchSelect();
		updateStockAddDropdown();
        updateProductionCostSelect();
        updateSalesPriceRecipeDropdown();
        updateSalesPriceSearchSelect();
        renderRecipes();
        renderProductionCostsTable();
        renderCalculatedPricesTable();
        renderPriceTable();
        updateOrderRecipeSelects();
    }

    async function deleteRecipe(id) {
        if (!canDeleteTab('herstellung')) {
            showToast('Du hast für diesen Tab keine Löschrechte.', 'danger', 'Löschen nicht erlaubt');
            return;
        }
        if (await customConfirm("Rezept löschen?")) {
            const recipe = recipesList.find(r => r.id === id);
            const { error } = await supabaseClient.from('recipes').delete().eq('id', id);
            if (!error) {
                recipesList = recipesList.filter(r => r.id !== id);
                delete recipeTargetAmounts[id];
                updateRecipeSearchSelect();
                updateProductionCostSelect();
                updateSalesPriceRecipeDropdown();
                updateSalesPriceSearchSelect();
                renderRecipes();
                renderProductionCostsTable();
                renderCalculatedPricesTable();
                renderPriceTable();
                updateOrderRecipeSelects();
                document.getElementById('crafting-action-box').style.display = 'none';
                logActivity('Rezept', `Rezept für "${recipe ? recipe.outputName : id}" gelöscht`);
            }
        }
    }

    function getStockAmount(name) {
        const item = inventoryList.find(i => i.name.toLowerCase() === name.toLowerCase());
        return item ? item.quantity : 0;
    }

    function updateRecipeSearchSelect() {
        const selectEl = document.getElementById('recipe-search-select');
        if (!selectEl) return;
        const currentSelected = selectEl.value;

        const sortedRecipes = [...recipesList].sort((a, b) => a.outputName.localeCompare(b.outputName, 'de'));
        selectEl.innerHTML = '<option value="ALL">-- Alle Artikel wählen --</option>';
        sortedRecipes.forEach(recipe => {
            const opt = document.createElement('option');
            opt.value = recipe.outputName;
            opt.innerText = recipe.outputName;
            selectEl.appendChild(opt);
        });
        selectEl.value = sortedRecipes.some(r => r.outputName === currentSelected) ? currentSelected : "ALL";
    }

    function clearRecipeSearch() {
        const selectEl = document.getElementById('recipe-search-select');
        const globalInput = document.getElementById('global-recipe-target-qty');
        
        if (selectEl) {
            selectEl.value = 'ALL';
        }
        if (globalInput) {
            globalInput.value = '1';
        }
        recipeTargetAmounts = {};
        renderRecipes();

        document.getElementById('crafting-action-box').style.display = 'none';
        document.getElementById('crafting-action-content').innerHTML = '';
    }

    function applyGlobalTargetQty() {
        const globalInput = document.getElementById('global-recipe-target-qty');
        if (!globalInput) return;
        let val = parseInt(globalInput.value, 10);
        if (isNaN(val) || val < 1) val = 1;

        recipesList.forEach(r => {
            recipeTargetAmounts[r.id] = val;
        });
        renderRecipes();
    }

    function triggerCraftingView() {
        const selectEl = document.getElementById('recipe-search-select');
        const craftingBox = document.getElementById('crafting-action-box');
        const contentDiv = document.getElementById('crafting-action-content');

        if (!selectEl || !craftingBox || !contentDiv) return;

        const selectedValue = selectEl.value;
        if (selectedValue === 'ALL') {
            alert("Bitte wähle zuerst ein spezifisches Rezept aus dem Dropdown aus.");
            craftingBox.style.display = 'none';
            return;
        }

        const recipe = recipesList.find(r => r.outputName === selectedValue);
        if (!recipe) {
            craftingBox.style.display = 'none';
            return;
        }

        const targetAmount = recipeTargetAmounts[recipe.id] !== undefined ? recipeTargetAmounts[recipe.id] : recipe.outputQty;
        
        let productionSteps = [];
        getRecursiveProductionSteps(recipe.outputName, targetAmount, productionSteps);

        let html = '';
        
        if (productionSteps.length <= 1) {
            html += `<div style="color: var(--text-muted); margin-bottom: 12px; font-size: 1rem;">Dieses Produkt benötigt keine Zwischenschritte. Es setzt sich direkt aus Rohmaterialien zusammen:</div>`;
        } else {
            html += `<div style="font-size: 1rem; font-weight: 700; color: #f8fafc; margin-bottom: 12px;">Zwischenschritte (von links nach rechts):</div>`;
            html += `<div style="display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 24px;">`;
            
            let stepCounter = 1;
            let intermediateSteps = productionSteps.filter(s => s.itemName.toLowerCase() !== recipe.outputName.toLowerCase());

            intermediateSteps.forEach(step => {
                let stock = getStockAmount(step.itemName);
                html += `<div style="background: var(--card-bg-raised); border: 1px solid var(--border-color); padding: 14px; border-radius: 8px; flex: 1; min-width: 240px; box-shadow: 0 4px 12px rgba(0,0,0,0.2);">`;
                html += `<div style="font-weight: 700; color: var(--accent-blue); font-size: 0.95rem; margin-bottom: 6px; border-bottom: 1px solid var(--border-color); padding-bottom: 4px;">Schritt ${stepCounter}: <strong>${step.actualProduced}x ${step.itemName}</strong></div>`;
                html += `<div style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 4px;">Benötigte Materialien:</div>`;
                
                step.ingredients.forEach(ing => {
                    let reqMatQty = ing.qty * step.multiplier;
                    let matStock = getStockAmount(ing.name);
                    let hasMatOk = matStock >= reqMatQty;
                    html += `<div style="margin-left: 8px; font-size: 0.85rem; margin-bottom: 2px;">• <strong>${reqMatQty}x</strong> ${ing.name} <span style="font-size: 0.8rem; color: var(--text-muted);">(Lager: <span style="color: ${hasMatOk ? 'var(--accent-green)' : 'var(--accent-red)'}; font-weight: 600;">${matStock}</span>)</span></div>`;
                });
                html += `</div>`;
                stepCounter++;
            });
            html += `</div>`;
        }

        html += `<div style="background: var(--card-bg-raised); border: 2px solid var(--accent-green); padding: 16px; border-radius: 8px; margin-top: 12px;">`;
        html += `<div style="font-size: 1.1rem; font-weight: 700; color: var(--accent-green); margin-bottom: 10px;">📦 Benötigte Rohmaterialien für ${targetAmount}x ${recipe.outputName}:</div>`;

        let rawMaterialMap = {};
        resolveRawMaterials(recipe.outputName, targetAmount, rawMaterialMap);

        let rawHtml = '';
        let allMaterialsOk = true;
        Object.keys(rawMaterialMap).forEach(matName => {
            let req = rawMaterialMap[matName];
            let stock = getStockAmount(matName);
            let ok = stock >= req;
            if (!ok) allMaterialsOk = false;
            let stockColor = stock === 0 ? 'color: var(--danger-color); font-weight: bold;' : (ok ? 'var(--accent-green)' : 'var(--accent-red)');
            rawHtml += `<div style="margin-bottom: 4px; font-size: 0.95rem;">• <strong>${req}x</strong> ${matName} <span style="color: var(--text-muted);">(Lagerbestand: <span style="color: ${stockColor}; font-weight: 600;">${stock}</span>)</span></div>`;
        });

        html += rawHtml;
        if (allMaterialsOk) {
            html += `<div style="margin-top: 12px; font-weight: 700; color: var(--accent-green);">✓ Du hast alle benötigten Rohmaterialien auf Lager!</div>`;
        } else {
            html += `<div style="margin-top: 12px; font-weight: 700; color: var(--accent-red);">✕ Dir fehlen einige Rohmaterialien im Lager!</div>`;
        }
        html += `</div>`;

        contentDiv.innerHTML = html;
        craftingBox.style.display = 'block';
    }

    function renderRecipes() {
        const tbody = document.getElementById('recipes-table-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        const selectEl = document.getElementById('recipe-search-select');
        const selectedValue = selectEl ? selectEl.value : 'ALL';

        let filteredRecipes = recipesList;
        if (selectedValue !== 'ALL') {
            filteredRecipes = recipesList.filter(r => r.outputName === selectedValue);
        }

        const sortedRecipes = [...filteredRecipes].sort((a, b) => a.outputName.localeCompare(b.outputName, 'de'));

        if (sortedRecipes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">Keine Rezepte gefunden.</td></tr>`;
            return;
        }

        sortedRecipes.forEach(recipe => {
            let targetQty = recipeTargetAmounts[recipe.id] !== undefined ? recipeTargetAmounts[recipe.id] : 1;
            let multiplier = Math.ceil(targetQty / recipe.outputQty);
            let actualProduced = multiplier * recipe.outputQty;

            let ingredientsHtml = '';
            let allIngredientsOk = true;

            if (recipe.ingredients && recipe.ingredients.length > 0) {
                recipe.ingredients.forEach(ing => {
                    let requiredAmount = ing.qty * multiplier;
                    let stockQty = getStockAmount(ing.name);
                    let isEnough = stockQty >= requiredAmount;
                    if (!isEnough) allIngredientsOk = false;

                    let stockColorStyle = stockQty === 0 ? 'color: var(--danger-color); font-weight: bold;' : (isEnough ? 'var(--accent-green)' : 'var(--accent-red)');

                    ingredientsHtml += `
                        <div style="margin-bottom: 4px; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                            <span>• <strong>${requiredAmount}x</strong> ${ing.name}</span>
                            <span style="font-size: 0.85rem; color: var(--text-muted);">(Lager: <span style="color: ${stockColorStyle}; font-weight: 600;">${stockQty}</span>)</span>
                        </div>`;
                });
            } else {
                ingredientsHtml = `<span style="color: var(--text-muted); font-style: italic;">Keine Zutaten definiert</span>`;
            }

            let statusHtml = buildStatusBadge(allIngredientsOk, 'Rohstoffe vorhanden', 'Rohstoffe fehlen');

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div style="display: flex; flex-direction: column; gap: 6px;">
                        <span class="material-name" style="color: var(--accent-blue); font-size: 1.05rem;">${recipe.outputName}</span>
                        <div style="display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: var(--text-muted);">
                            <span>Rezept-Ertrag: <strong>${recipe.outputQty} Stk.</strong></span>
                             
                        </div>
                        <div style="font-size: 0.9rem; color: var(--accent-green); font-weight: 600;">🡒 Daraus resultierender Ertrag: ${actualProduced} Stk. (${multiplier} Durchgänge)</div>
                    </div>
                </td>
                <td><div style="font-size: 0.9rem; line-height: 1.4; background: var(--panel-bg-blue); padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color);">${ingredientsHtml}</div></td>
                <td>${statusHtml}</td>
                <td>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-secondary" style="height: 38px; font-size: 0.85rem;" onclick="editRecipe(${recipe.id})">Bearbeiten</button>
                        <button class="btn btn-danger delete-action" data-permission-action="delete" onclick="deleteRecipe(${recipe.id})">Löschen</button>
                    </div>
                </td>
            `;
            tbody.appendChild(tr);
        });
    }
	
	async function craftRecipe(recipeId) {
        const recipe = recipesList.find(r => r.id === recipeId);
        if (!recipe) return;
        let targetQty = recipeTargetAmounts[recipeId] || recipe.outputQty;
        await executeCrafting(recipe.outputName, targetQty);
    }

