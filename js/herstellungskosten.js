    function getRecipeCostPerUnit(itemName) {
        const recipe = recipesList.find(r => r.outputName.toLowerCase() === itemName.toLowerCase());
        if (!recipe || !recipe.ingredients || recipe.outputQty <= 0) return 0;
        
        let totalIngredientCost = 0;
        recipe.ingredients.forEach(ing => {
            const bestCost = getLowestPurchaseCost(ing.name);
            totalIngredientCost += ing.qty * bestCost;
        });
        return totalIngredientCost / recipe.outputQty;
    }

    function recipeHasZeroCost(itemName) {
        const recipe = recipesList.find(r => r.outputName.toLowerCase() === itemName.toLowerCase());
        if (!recipe) return true;
        let costPerUnit = getRecipeCostPerUnit(itemName);
        if (costPerUnit === 0) return true;
        let hasZero = false;
        if (recipe.ingredients) {
            recipe.ingredients.forEach(ing => {
                if (getLowestPurchaseCost(ing.name) === 0) hasZero = true;
            });
        }
        return hasZero;
    }

    function getRecipeTooltipHtml(itemName) {
        const recipe = recipesList.find(r => r.outputName.toLowerCase() === itemName.toLowerCase());
        if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0) {
            return `<span style="color: var(--text-muted); font-style: italic;">Kein Rezept hinterlegt</span>`;
        }
        let html = `<div style="font-weight: 600; margin-bottom: 4px; color: var(--accent-blue);">Rezept (${recipe.outputQty} Stk.):</div>`;
        recipe.ingredients.forEach(ing => {
            let activeCost = getLowestPurchaseCost(ing.name);
            let costStyle = activeCost === 0 ? 'color: var(--danger-color); font-weight: bold;' : '';
            html += `<div>• ${ing.qty}x ${ing.name} <span style="${costStyle}">($${activeCost.toFixed(2)})</span></div>`;
        });
        return html;
    }

    function updateProductionCostSelect() {
        const selectEl = document.getElementById('production-cost-search');
        if (!selectEl) return;
        const currentSelected = selectEl.value;

        const sortedRecipes = [...recipesList].sort((a, b) => a.outputName.localeCompare(b.outputName, 'de'));
        selectEl.innerHTML = '<option value="ALL">-- Alle Rezepte anzeigen --</option>';
        sortedRecipes.forEach(recipe => {
            const opt = document.createElement('option');
            opt.value = recipe.outputName;
            opt.innerText = recipe.outputName;
            selectEl.appendChild(opt);
        });

        const exists = sortedRecipes.some(r => r.outputName === currentSelected);
        selectEl.value = exists ? currentSelected : "ALL";
    }

    function clearProductionCostSearch() {
        const selectEl = document.getElementById('production-cost-search');
        if (selectEl) {
            selectEl.value = 'ALL';
            renderProductionCostsTable();
        }
    }

    function updateSalesPriceSearchSelect() {
        const selectEl = document.getElementById('sales-price-search');
        if (!selectEl) return;
        const currentSelected = selectEl.value;

        const sortedSales = [...salesPricesList].sort((a, b) => a.name.localeCompare(b.name, 'de'));
        selectEl.innerHTML = '<option value="ALL">-- Alle Artikel anzeigen --</option>';
        sortedSales.forEach(item => {
            const opt = document.createElement('option');
            opt.value = item.name;
            opt.innerText = item.name;
            selectEl.appendChild(opt);
        });

        const exists = sortedSales.some(s => s.name === currentSelected);
        selectEl.value = exists ? currentSelected : "ALL";
    }

    function clearSalesPriceSearch() {
        const selectEl = document.getElementById('sales-price-search');
        if (selectEl) {
            selectEl.value = 'ALL';
            renderPriceTable();
        }
    }

    function renderProductionCostsTable() {
        const tbody = document.getElementById('production-costs-body');
        if (!tbody) return;
        tbody.innerHTML = '';

        if (recipesList.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">Keine Rezepte vorhanden. Bitte erst im Tab „Herstellung“ Rezepte anlegen.</td></tr>`;
            return;
        }

        const selectEl = document.getElementById('production-cost-search');
        const selectedValue = selectEl ? selectEl.value : 'ALL';

        let filteredRecipes = recipesList;
        if (selectedValue !== 'ALL') {
            filteredRecipes = recipesList.filter(r => r.outputName === selectedValue);
        }

        const sortedRecipes = [...filteredRecipes].sort((a, b) => a.outputName.localeCompare(b.outputName, 'de'));

        if (sortedRecipes.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 20px;">Keine passenden Endprodukte gefunden.</td></tr>`;
            return;
        }

        sortedRecipes.forEach(recipe => {
            let costPerUnit = getRecipeCostPerUnit(recipe.outputName);
            let ingredientsHtml = '';
            let hasZeroIngredient = false;

            if (recipe.ingredients && recipe.ingredients.length > 0) {
                recipe.ingredients.forEach((ing, ingIndex) => {
                    let activeCost = getLowestPurchaseCost(ing.name);
                    let subTotal = ing.qty * activeCost;
                    if (activeCost === 0 || subTotal === 0) {
                        hasZeroIngredient = true;
                    }
                    let currentManualVal = manualIngredientPrices[ing.name] !== undefined ? manualIngredientPrices[ing.name] : '';
                    let inputId = `man-ing-input-${recipe.id}-${ingIndex}`;

                    let subTotalColor = (activeCost === 0 || subTotal === 0) ? 'color: var(--danger-color); font-weight: bold;' : 'color: var(--accent-green); font-weight: 600;';

                    ingredientsHtml += `
                        <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 6px; background: var(--panel-bg-blue); padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-color);">
                            <span>• ${ing.qty}x <strong>${ing.name}</strong></span>
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <input type="number" step="0.01" min="0" placeholder="$ Preis" value="${currentManualVal}" id="${inputId}" style="width: 100px; padding: 4px 8px; font-size: 0.85rem;" />
                                <button class="btn" style="padding: 4px 10px; height: 32px; font-size: 0.8rem;" onclick="saveManualIngredientPrice('${ing.name}', '${inputId}')">Speichern</button>
                                <span style="${subTotalColor} min-width: 60px; text-align: right;">= $${subTotal.toFixed(2)}</span>
                            </div>
                        </div>`;
                });
            } else {
                ingredientsHtml = `<span style="color: var(--text-muted); font-style: italic;">Keine Zutaten definiert</span>`;
            }

            const isZero = costPerUnit === 0 || hasZeroIngredient;
            const costClass = isZero ? "current-cost zero-cost" : "current-cost";
            const nameColorStyle = isZero ? "color: var(--danger-color) !important;" : "color: var(--accent-blue);";

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="material-name" style="${nameColorStyle}">${recipe.outputName}</span></td>
                <td><span style="font-weight: 600;">${recipe.outputQty}</span></td>
                <td><div style="font-size: 0.9rem;">${ingredientsHtml}</div></td>
                <td><span class="${costClass}">$${costPerUnit.toFixed(2)}</span></td>
            `;
            tbody.appendChild(tr);
        });
    }

    function resolveRawMaterials(itemName, neededQty, accumulator = {}) {
        const recipe = recipesList.find(r => r.outputName.toLowerCase() === itemName.toLowerCase());
        
        if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0 || recipe.outputQty <= 0) {
            if (!accumulator[itemName]) {
                accumulator[itemName] = 0;
            }
            accumulator[itemName] += neededQty;
            return accumulator;
        }

        let multiplier = Math.ceil(neededQty / recipe.outputQty);
        recipe.ingredients.forEach(ing => {
            let subNeeded = ing.qty * multiplier;
            resolveRawMaterials(ing.name, subNeeded, accumulator);
        });

        return accumulator;
    }

    function getRecursiveProductionSteps(itemName, neededQty, stepsList = []) {
        const recipe = recipesList.find(r => r.outputName.toLowerCase() === itemName.toLowerCase());
        if (!recipe || !recipe.ingredients || recipe.ingredients.length === 0 || recipe.outputQty <= 0) {
            return stepsList;
        }

        let multiplier = Math.ceil(neededQty / recipe.outputQty);
        let actualProduced = multiplier * recipe.outputQty;

        recipe.ingredients.forEach(ing => {
            getRecursiveProductionSteps(ing.name, ing.qty * multiplier, stepsList);
        });

        if (!stepsList.some(s => s.itemName.toLowerCase() === recipe.outputName.toLowerCase())) {
            stepsList.push({
                itemName: recipe.outputName,
                neededQty: neededQty,
                multiplier: multiplier,
                actualProduced: actualProduced,
                ingredients: recipe.ingredients
            });
        }

        return stepsList;
    }

