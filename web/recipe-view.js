(() => {
  const SHORTCUT_NAME = "Add Shopping List";

  const text = (element, value) => {
    element.textContent = String(value);
    return element;
  };

  const formatQuantity = (value) => {
    const number = Number(value);
    return Number.isInteger(number)
      ? String(number)
      : number.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  };

  function effectiveMeal(meal, selectedSubstitutionIds = new Set()) {
    const substitutions = (meal.substitutions || []).filter((substitution) =>
      selectedSubstitutionIds.has(substitution.id),
    );
    const replaced = new Set(substitutions.flatMap((substitution) => substitution.replaces || []));
    const omittedPantry = new Set(
      substitutions.flatMap((substitution) => substitution.omit_pantry || []),
    );
    return {
      ...meal,
      buy: [
        ...(meal.buy || []).filter((item) => !replaced.has(item.ingredient_id)),
        ...substitutions.flatMap((substitution) => substitution.buy || []),
      ],
      pantry: (meal.pantry || []).filter((item) => !omittedPantry.has(item)),
    };
  }

  function shoppingItems(meal, ingredientsRoot) {
    const totals = new Map();
    for (const item of meal.buy || []) {
      const metadata = ingredientsRoot.ingredients[item.ingredient_id];
      if (!metadata) throw new Error(`Unknown shopping ingredient: ${item.ingredient_id}`);
      const existing = totals.get(item.ingredient_id);
      if (existing) {
        existing.quantity += Number(item.quantity);
      } else {
        totals.set(item.ingredient_id, {
          ...item,
          quantity: Number(item.quantity),
          name: metadata.name,
          category: metadata.category,
          pack_quantity: Number(metadata.pack_quantity),
          pack_unit: metadata.pack_unit,
        });
      }
    }
    return [...totals.values()].map((item) => ({
      ...item,
      packs: Math.max(1, Math.ceil(item.quantity / item.pack_quantity)),
    }));
  }

  function reminderLines(meal, ingredientsRoot) {
    return shoppingItems(meal, ingredientsRoot)
      .map(
        (item) =>
          `${item.name} — ${formatQuantity(item.quantity)} ${item.unit} required ` +
          `(${item.packs} × ${formatQuantity(item.pack_quantity)} ${item.pack_unit})`,
      )
      .join("\n");
  }

  function sendToReminders(meal, ingredientsRoot) {
    const lines = reminderLines(meal, ingredientsRoot);
    location.href =
      `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}` +
      `&input=text&text=${encodeURIComponent(lines)}`;
  }

  function createShoppingList(meal, ingredientsRoot) {
    const list = document.createElement("ul");
    list.className = "shopping-list";
    const items = shoppingItems(meal, ingredientsRoot).sort(
      (left, right) =>
        left.category.localeCompare(right.category) || left.name.localeCompare(right.name),
    );

    let currentCategory = "";
    for (const item of items) {
      if (item.category !== currentCategory) {
        const category = text(document.createElement("li"), item.category);
        category.className = "category mono";
        list.append(category);
        currentCategory = item.category;
      }

      const row = document.createElement("li");
      const required = text(
        document.createElement("span"),
        `${item.name} — ${formatQuantity(item.quantity)} ${item.unit}`,
      );
      const packs = text(
        document.createElement("span"),
        `${item.packs} × ${formatQuantity(item.pack_quantity)} ${item.pack_unit}`,
      );
      packs.className = "mono muted";
      row.append(required, packs);
      list.append(row);
    }
    return list;
  }

  function createPantryList(meal, pantryRoot) {
    const pantryItems = meal.pantry || [];
    if (!pantryItems.length) {
      const empty = text(document.createElement("p"), "None.");
      empty.className = "recipe-pantry muted";
      return empty;
    }
    const list = document.createElement("ul");
    list.className = "recipe-pantry";
    for (const pantryId of pantryItems) {
      list.append(
        text(document.createElement("li"), pantryRoot?.pantry?.[pantryId]?.name || pantryId),
      );
    }
    return list;
  }

  function createRecipeCard(meal, ingredientsRoot, pantryRoot, options = {}) {
    const headingLevel = options.headingLevel === 3 ? 3 : 2;
    const sectionLevel = headingLevel === 3 ? 4 : 3;
    const article = document.createElement("article");
    article.className = "recipe-card";
    const selectedSubstitutions = new Set();

    const header = document.createElement("div");
    header.className = "recipe-header";
    const heading = text(document.createElement(`h${headingLevel}`), meal.name);
    heading.className = "recipe-title";
    const reminderButton = text(document.createElement("button"), "Add to Reminders");
    reminderButton.className = "button secondary recipe-reminder";
    reminderButton.type = "button";
    reminderButton.addEventListener("click", () =>
      sendToReminders(effectiveMeal(meal, selectedSubstitutions), ingredientsRoot),
    );
    header.append(heading, reminderButton);

    const description = text(document.createElement("p"), meal.description);
    description.className = "recipe-description";
    const macros = meal.macros;
    const macroSummary = text(
      document.createElement("div"),
      `Approx. ${macros.calories_kcal} kcal · ${macros.protein_g} g protein · ` +
        `${macros.carbs_g} g carbs · ${macros.fat_g} g fat`,
    );
    macroSummary.className = "macros mono";

    const details = document.createElement("details");
    const summary = text(document.createElement("summary"), "Ingredients & method");
    const detailsBody = document.createElement("div");
    detailsBody.className = "recipe-details";

    const shoppingHeading = text(document.createElement(`h${sectionLevel}`), "Shopping list");
    shoppingHeading.className = "recipe-section-title";
    const shoppingContainer = document.createElement("div");

    const pantryHeading = text(
      document.createElement(`h${sectionLevel}`),
      "Pantry ingredients (assumed in stock)",
    );
    pantryHeading.className = "recipe-section-title";
    const pantryContainer = document.createElement("div");

    const substitutionNotes = document.createElement("div");
    substitutionNotes.className = "substitution-notes";

    const renderIngredients = () => {
      const currentMeal = effectiveMeal(meal, selectedSubstitutions);
      shoppingContainer.replaceChildren(createShoppingList(currentMeal, ingredientsRoot));
      pantryContainer.replaceChildren(createPantryList(currentMeal, pantryRoot));
      const notes = (meal.substitutions || []).filter((substitution) =>
        selectedSubstitutions.has(substitution.id),
      );
      substitutionNotes.replaceChildren(
        ...notes.map((substitution) => {
          const note = text(document.createElement("p"), substitution.note);
          note.className = "summary";
          return note;
        }),
      );
    };

    if ((meal.substitutions || []).length) {
      const fieldset = document.createElement("fieldset");
      fieldset.className = "recipe-substitutions";
      fieldset.append(text(document.createElement("legend"), "Optional substitutions"));
      for (const substitution of meal.substitutions) {
        const label = document.createElement("label");
        label.className = "checkbox";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.addEventListener("change", () => {
          if (checkbox.checked) selectedSubstitutions.add(substitution.id);
          else selectedSubstitutions.delete(substitution.id);
          renderIngredients();
        });
        label.append(checkbox, document.createTextNode(substitution.label));
        fieldset.append(label);
      }
      detailsBody.append(fieldset, substitutionNotes);
    }

    detailsBody.append(shoppingHeading, shoppingContainer, pantryHeading, pantryContainer);
    if ((meal.instructions || []).length) {
      const methodHeading = text(document.createElement(`h${sectionLevel}`), "Method");
      methodHeading.className = "recipe-section-title";
      const method = document.createElement("ol");
      method.className = "recipe-method";
      for (const step of meal.instructions) {
        method.append(text(document.createElement("li"), step));
      }
      detailsBody.append(methodHeading, method);
    }

    renderIngredients();
    details.append(summary, detailsBody);
    article.append(header, description, macroSummary, details);
    return article;
  }

  globalThis.MealRecipeView = {
    createRecipeCard,
    effectiveMeal,
    reminderLines,
    shoppingItems,
  };
})();
