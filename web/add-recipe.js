(() => {
  const PUBLISH_API = "https://meal-api.james-platt.com/publish";
  const form = document.querySelector("#recipe-form");
  const content = document.querySelector("#content");
  const ingredientRows = document.querySelector("#ingredients");
  const newIngredientRows = document.querySelector("#new-ingredients");
  const pantryOptions = document.querySelector("#pantry-options");
  const pantrySearch = document.querySelector("#pantry-search");
  const newPantryRows = document.querySelector("#new-pantry-items");
  const substitutionRows = document.querySelector("#substitutions");
  const status = document.querySelector("#status");
  const output = document.querySelector("#output");
  const previewSection = document.querySelector("#preview-section");
  const preview = document.querySelector("#recipe-preview");
  const downloadButton = document.querySelector("#download");
  const copyButton = document.querySelector("#copy");
  const publishButton = document.querySelector("#publish");
  const passwordInput = document.querySelector("#admin-password");
  const nameInput = document.querySelector("#name");
  const idInput = document.querySelector("#id");

  let module;
  let validateRecipe;
  let freeResult;
  let ingredientsRoot;
  let pantryRoot;
  let latestJson = "";
  const selectedPantry = new Set();

  requestAnimationFrame(() => content?.classList.add("is-visible"));

  const slug = (value) =>
    value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const splitIds = (value) => value.split(",").map((item) => item.trim()).filter(Boolean);
  const safeId = (value) => /^[a-z0-9_]{1,64}$/.test(value);
  const lines = (value) => value.split("\n").map((item) => item.trim()).filter(Boolean);

  nameInput.addEventListener("input", () => {
    if (!idInput.dataset.manual) idInput.value = slug(nameInput.value);
  });
  idInput.addEventListener("input", () => {
    idInput.dataset.manual = "true";
  });

  function ingredientDefinitions() {
    const definitions = {};
    for (const row of newIngredientRows.querySelectorAll(".new-ingredient-row")) {
      const values = [...row.querySelectorAll("input")].map((input) => input.value.trim());
      const [id, name, category, packQuantity, packUnit] = values;
      if (!values.some(Boolean)) continue;
      if (!values.every(Boolean)) throw new Error("Complete every field for each new ingredient.");
      if (!safeId(id)) throw new Error(`New ingredient ID '${id}' is invalid.`);
      if (ingredientsRoot.ingredients[id]) {
        throw new Error(`Ingredient ID '${id}' already exists in the catalogue.`);
      }
      if (definitions[id]) throw new Error(`New ingredient ID '${id}' is duplicated.`);
      const quantity = Number(packQuantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        throw new Error(`Pack quantity for '${id}' must be greater than zero.`);
      }
      definitions[id] = { name, category, pack_quantity: quantity, pack_unit: packUnit };
    }
    return definitions;
  }

  function pantryDefinitions() {
    const definitions = {};
    for (const row of newPantryRows.querySelectorAll(".new-pantry-row")) {
      const [id, name] = [...row.querySelectorAll("input")].map((input) => input.value.trim());
      if (!id && !name) continue;
      if (!id || !name) throw new Error("Complete the ID and name for every new pantry item.");
      if (!safeId(id)) throw new Error(`New pantry ID '${id}' is invalid.`);
      if (pantryRoot.pantry[id]) throw new Error(`Pantry ID '${id}' already exists.`);
      if (definitions[id]) throw new Error(`New pantry ID '${id}' is duplicated.`);
      definitions[id] = { name };
    }
    return definitions;
  }

  function mergedIngredients() {
    const root = JSON.parse(JSON.stringify(ingredientsRoot));
    Object.assign(root.ingredients, ingredientDefinitions());
    return root;
  }

  function mergedPantry() {
    const root = JSON.parse(JSON.stringify(pantryRoot));
    Object.assign(root.pantry, pantryDefinitions());
    return root;
  }

  function ingredientOptions() {
    return Object.entries(availableIngredients().ingredients).sort((left, right) =>
      left[1].name.localeCompare(right[1].name),
    );
  }

  function availableIngredients() {
    try {
      return mergedIngredients();
    } catch {
      return ingredientsRoot;
    }
  }

  function populateIngredientSelect(select, keep = select.value) {
    select.replaceChildren();
    for (const [id, metadata] of ingredientOptions()) {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = `${metadata.name} (${id})`;
      select.append(option);
    }
    if ([...select.options].some((option) => option.value === keep)) select.value = keep;
    select.dispatchEvent(new Event("change"));
  }

  function refreshIngredientSelects() {
    for (const select of document.querySelectorAll("select.ingredient-select")) {
      populateIngredientSelect(select);
    }
  }

  function addIngredientRow() {
    const row = document.createElement("div");
    row.className = "ingredient-row";
    const select = document.createElement("select");
    select.className = "ingredient-select";
    select.required = true;
    const quantity = document.createElement("input");
    quantity.type = "number";
    quantity.min = "0.01";
    quantity.step = "any";
    quantity.value = "1";
    quantity.required = true;
    const unit = document.createElement("input");
    unit.type = "text";
    unit.readOnly = true;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button secondary";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      row.remove();
      invalidate();
    });
    select.addEventListener("change", () => {
      const metadata = availableIngredients().ingredients[select.value];
      unit.value = metadata?.pack_unit || "";
    });
    row.append(select, quantity, unit, remove);
    ingredientRows.append(row);
    populateIngredientSelect(select);
  }

  function addNewIngredientRow() {
    const row = document.createElement("div");
    row.className = "new-ingredient-row";
    const fields = [
      ["ID, e.g. garlic", "text"],
      ["Name", "text"],
      ["Category", "text"],
      ["Pack qty", "number"],
      ["Unit, e.g. g/ml/each", "text"],
    ].map(([placeholder, type]) => {
      const input = document.createElement("input");
      input.type = type;
      input.placeholder = placeholder;
      if (type === "number") {
        input.min = "0.01";
        input.step = "any";
      }
      input.addEventListener("input", refreshIngredientSelects);
      return input;
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button secondary";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      row.remove();
      refreshIngredientSelects();
      invalidate();
    });
    row.append(...fields, remove);
    newIngredientRows.append(row);
  }

  function renderPantryOptions() {
    let pantry;
    try {
      pantry = mergedPantry().pantry;
    } catch {
      pantry = pantryRoot.pantry;
    }
    const query = pantrySearch.value.trim().toLowerCase();
    const entries = Object.entries(pantry)
      .filter(([id, metadata]) => `${id} ${metadata.name}`.toLowerCase().includes(query))
      .sort((left, right) => left[1].name.localeCompare(right[1].name));
    pantryOptions.replaceChildren();
    for (const [id, metadata] of entries) {
      const label = document.createElement("label");
      label.className = "checkbox pantry-option";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.value = id;
      checkbox.checked = selectedPantry.has(id);
      checkbox.addEventListener("change", () => {
        if (checkbox.checked) selectedPantry.add(id);
        else selectedPantry.delete(id);
      });
      label.append(checkbox, document.createTextNode(`${metadata.name} (${id})`));
      pantryOptions.append(label);
    }
    if (!entries.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "No pantry ingredients match your search.";
      pantryOptions.append(empty);
    }
  }

  function addNewPantryRow() {
    const row = document.createElement("div");
    row.className = "new-pantry-row";
    for (const placeholder of ["ID, e.g. black_pepper", "Display name"]) {
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = placeholder;
      input.addEventListener("input", renderPantryOptions);
      row.append(input);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button secondary";
    remove.textContent = "Remove";
    remove.addEventListener("click", () => {
      row.remove();
      renderPantryOptions();
      invalidate();
    });
    row.append(remove);
    newPantryRows.append(row);
  }

  function addSubstitutionRow() {
    const row = document.createElement("fieldset");
    row.className = "substitution-row";
    const legend = document.createElement("legend");
    legend.textContent = "Substitution";
    const definitions = [
      ["id", "ID, e.g. pre_breaded_chicken"],
      ["label", "Label shown on recipe card"],
      ["note", "Cooking note shown when selected"],
      ["replaces", "Shopping IDs replaced, comma-separated"],
      ["omit", "Pantry IDs omitted, comma-separated (optional)"],
    ];
    const fields = definitions.map(([field, placeholder]) => {
      const input = document.createElement("input");
      input.type = "text";
      input.dataset.field = field;
      input.placeholder = placeholder;
      return input;
    });
    const select = document.createElement("select");
    select.className = "ingredient-select";
    select.dataset.field = "buy";
    const quantity = document.createElement("input");
    quantity.type = "number";
    quantity.min = "0.01";
    quantity.step = "any";
    quantity.value = "1";
    quantity.dataset.field = "quantity";
    const unit = document.createElement("input");
    unit.type = "text";
    unit.readOnly = true;
    unit.dataset.field = "unit";
    select.addEventListener("change", () => {
      unit.value = availableIngredients().ingredients[select.value]?.pack_unit || "";
    });
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button secondary";
    remove.textContent = "Remove substitution";
    remove.addEventListener("click", () => {
      row.remove();
      invalidate();
    });
    row.append(legend, ...fields, select, quantity, unit, remove);
    substitutionRows.append(row);
    populateIngredientSelect(select);
  }

  function substitutions(catalogue, pantryCatalogue) {
    return [...substitutionRows.querySelectorAll(".substitution-row")].map((row) => {
      const value = (field) => row.querySelector(`[data-field="${field}"]`).value.trim();
      const id = value("id");
      const label = value("label");
      const note = value("note");
      const replaces = splitIds(value("replaces"));
      const omitPantry = splitIds(value("omit"));
      const buyId = value("buy");
      const quantity = Number(value("quantity"));
      if (!safeId(id) || !label || !note || !replaces.length || !buyId || quantity <= 0) {
        throw new Error("Complete every required substitution field.");
      }
      for (const pantryId of omitPantry) {
        if (!pantryCatalogue.pantry[pantryId]) {
          throw new Error(`Unknown pantry ID in substitution: '${pantryId}'.`);
        }
      }
      return {
        id,
        label,
        replaces,
        buy: [{
          ingredient_id: buyId,
          quantity,
          unit: catalogue.ingredients[buyId].pack_unit,
        }],
        omit_pantry: omitPantry,
        note,
      };
    });
  }

  function recipe() {
    const ingredientDefs = ingredientDefinitions();
    const pantryDefs = pantryDefinitions();
    const catalogue = mergedIngredients();
    const pantryCatalogue = mergedPantry();
    const buy = [...ingredientRows.querySelectorAll(".ingredient-row")].map((row) => {
      const controls = row.querySelectorAll("select,input");
      const ingredientId = controls[0].value;
      return {
        ingredient_id: ingredientId,
        quantity: Number(controls[1].value),
        unit: catalogue.ingredients[ingredientId].pack_unit,
      };
    });
    const pantry = [...selectedPantry].filter((id) => pantryCatalogue.pantry[id]);
    const result = {
      id: idInput.value.trim(),
      name: nameInput.value.trim(),
      description: document.querySelector("#description").value.trim(),
      servings: Number(document.querySelector("#servings").value),
      active: document.querySelector("#active").checked,
      macros: {
        calories_kcal: Number(document.querySelector("#kcal").value),
        protein_g: Number(document.querySelector("#protein").value),
        carbs_g: Number(document.querySelector("#carbs").value),
        fat_g: Number(document.querySelector("#fat").value),
      },
      buy,
      pantry,
      instructions: lines(document.querySelector("#instructions").value),
    };
    const makeAheadValues = {
      component: document.querySelector("#make-ahead-component").value.trim(),
      hours: document.querySelector("#make-ahead-hours").value.trim(),
      instructions: lines(document.querySelector("#make-ahead-instructions").value),
      storage: document.querySelector("#make-ahead-storage").value.trim(),
      dayOf: lines(document.querySelector("#make-ahead-day-of").value),
    };
    if (
      makeAheadValues.component ||
      makeAheadValues.hours ||
      makeAheadValues.instructions.length ||
      makeAheadValues.storage ||
      makeAheadValues.dayOf.length
    ) {
      const hours = Number(makeAheadValues.hours);
      if (
        !makeAheadValues.component ||
        !Number.isInteger(hours) ||
        hours < 1 ||
        hours > 48 ||
        !makeAheadValues.instructions.length ||
        !makeAheadValues.storage ||
        !makeAheadValues.dayOf.length
      ) {
        throw new Error("Complete every prepare-ahead field, using a refrigerated time from 1 to 48 hours.");
      }
      result.make_ahead = {
        component: makeAheadValues.component,
        max_refrigerated_hours: hours,
        instructions: makeAheadValues.instructions,
        storage: makeAheadValues.storage,
        day_of: makeAheadValues.dayOf,
      };
    }
    const alternativeItems = substitutions(catalogue, pantryCatalogue);
    if (alternativeItems.length) result.substitutions = alternativeItems;
    if (Object.keys(ingredientDefs).length) result.ingredient_definitions = ingredientDefs;
    if (Object.keys(pantryDefs).length) result.pantry_definitions = pantryDefs;
    return result;
  }

  function validate(currentRecipe) {
    let pointer = 0;
    try {
      pointer = validateRecipe(
        JSON.stringify(currentRecipe),
        JSON.stringify(mergedIngredients()),
        JSON.stringify(mergedPantry()),
      );
      if (!pointer) throw new Error("C++ validator returned no result.");
      const result = JSON.parse(module.UTF8ToString(pointer));
      if (result.error) throw new Error(result.error);
      return result;
    } finally {
      if (pointer) freeResult(pointer);
    }
  }

  function invalidate() {
    if (!latestJson) return;
    latestJson = "";
    downloadButton.disabled = true;
    copyButton.disabled = true;
    publishButton.disabled = true;
    output.classList.add("hidden");
    previewSection.classList.add("hidden");
    status.textContent = "Changes made. Validate the recipe again before publishing.";
    status.className = "status";
  }

  function setValid(currentRecipe) {
    latestJson = `${JSON.stringify(currentRecipe, null, 2)}\n`;
    output.textContent = latestJson;
    output.classList.remove("hidden");
    downloadButton.disabled = false;
    copyButton.disabled = false;
    publishButton.disabled = false;
    const previewRecipe = { ...currentRecipe };
    delete previewRecipe.ingredient_definitions;
    delete previewRecipe.pantry_definitions;
    preview.replaceChildren(
      MealRecipeView.createRecipeCard(previewRecipe, mergedIngredients(), mergedPantry()),
    );
    previewSection.classList.remove("hidden");
    status.textContent = "Valid recipe. Review the card preview, then publish when ready.";
    status.className = "status success";
  }

  async function initialise() {
    try {
      const [ingredientResponse, pantryResponse, wasm] = await Promise.all([
        fetch("data/ingredients.json", { cache: "no-store" }),
        fetch("data/pantry.json", { cache: "no-store" }),
        createMealPlannerModule(),
      ]);
      if (!ingredientResponse.ok || !pantryResponse.ok) {
        throw new Error("Could not load ingredient catalogues.");
      }
      [ingredientsRoot, pantryRoot] = await Promise.all([
        ingredientResponse.json(),
        pantryResponse.json(),
      ]);
      module = wasm;
      validateRecipe = module.cwrap("validate_recipe", "number", ["string", "string", "string"]);
      freeResult = module.cwrap("free_result", null, ["number"]);
      addIngredientRow();
      renderPantryOptions();
      status.textContent = "";
    } catch (error) {
      status.textContent = error.message || "Could not load recipe editor.";
      status.classList.add("error");
    }
  }

  document.querySelector("#add-ingredient").addEventListener("click", () => {
    invalidate();
    addIngredientRow();
  });
  document.querySelector("#add-new-ingredient").addEventListener("click", () => {
    invalidate();
    addNewIngredientRow();
  });
  document.querySelector("#add-new-pantry-item").addEventListener("click", () => {
    invalidate();
    addNewPantryRow();
  });
  document.querySelector("#add-substitution").addEventListener("click", () => {
    invalidate();
    addSubstitutionRow();
  });
  pantrySearch.addEventListener("input", renderPantryOptions);
  form.addEventListener("input", (event) => {
    if (event.target !== passwordInput) invalidate();
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    status.className = "status";
    try {
      if (!form.reportValidity()) return;
      const currentRecipe = recipe();
      if (!currentRecipe.buy.length) throw new Error("Add at least one shopping ingredient.");
      if (!currentRecipe.instructions.length) throw new Error("Add at least one instruction.");
      validate(currentRecipe);
      setValid(currentRecipe);
    } catch (error) {
      latestJson = "";
      downloadButton.disabled = true;
      copyButton.disabled = true;
      publishButton.disabled = true;
      output.classList.add("hidden");
      previewSection.classList.add("hidden");
      status.textContent = error.message || "Recipe is invalid.";
      status.classList.add("error");
    }
  });

  publishButton.addEventListener("click", async () => {
    if (!latestJson) return;
    const password = passwordInput.value;
    if (!password) {
      status.textContent = "Enter the admin password before publishing.";
      status.className = "status error";
      passwordInput.focus();
      return;
    }
    publishButton.disabled = true;
    status.textContent = "Publishing…";
    status.className = "status";
    try {
      const response = await fetch(PUBLISH_API, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password, recipe: JSON.parse(latestJson) }),
      });
      let body = {};
      try {
        body = await response.json();
      } catch {}
      if (!response.ok) throw new Error(body.error || `Publish failed (${response.status}).`);
      passwordInput.value = "";
      status.textContent = body.updated
        ? "Recipe and catalogues updated in GitHub. Pages will redeploy shortly."
        : "Recipe and catalogues published to GitHub. Pages will redeploy shortly.";
      status.className = "status success";
    } catch (error) {
      status.textContent = error.message || "Could not publish recipe.";
      status.className = "status error";
    } finally {
      publishButton.disabled = false;
    }
  });

  downloadButton.addEventListener("click", () => {
    if (!latestJson) return;
    const blob = new Blob([latestJson], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${idInput.value.trim() || "recipe"}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 0);
  });

  copyButton.addEventListener("click", async () => {
    if (!latestJson) return;
    try {
      await navigator.clipboard.writeText(latestJson);
      status.textContent = "Recipe JSON copied.";
      status.className = "status success";
    } catch {
      status.textContent = "Clipboard access was blocked; use Download JSON instead.";
      status.className = "status error";
    }
  });

  initialise();
})();
