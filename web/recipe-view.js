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
      : number.toFixed(1).replace(/\.0$/, "");
  };

  const formatPantryItem = (value) =>
    String(value).replaceAll("_", " ").replace(/^./, (letter) => letter.toUpperCase());

  function shoppingItems(meal, ingredientsRoot) {
    return (meal.buy || []).map((item) => {
      const metadata = ingredientsRoot.ingredients[item.ingredient_id];
      const packQuantity = Number(metadata.pack_quantity);
      const requiredQuantity = Number(item.quantity);
      const packs = Math.max(1, Math.ceil(requiredQuantity / packQuantity));

      return {
        ...item,
        name: metadata.name,
        category: metadata.category,
        pack_quantity: packQuantity,
        pack_unit: metadata.pack_unit,
        packs,
      };
    });
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

  function createRecipeCard(meal, ingredientsRoot, options = {}) {
    const headingLevel = options.headingLevel === 3 ? 3 : 2;
    const sectionLevel = headingLevel === 3 ? 4 : 3;
    const article = document.createElement("article");
    article.className = "recipe-card";

    const header = document.createElement("div");
    header.className = "recipe-header";

    const heading = text(document.createElement(`h${headingLevel}`), meal.name);
    heading.className = "recipe-title";

    const reminderButton = text(document.createElement("button"), "Add to Reminders");
    reminderButton.className = "button secondary recipe-reminder";
    reminderButton.type = "button";
    reminderButton.addEventListener("click", () => sendToReminders(meal, ingredientsRoot));
    header.append(heading, reminderButton);

    const description = text(document.createElement("p"), meal.description);
    description.className = "recipe-description";

    const macros = meal.macros;
    const macroSummary = text(
      document.createElement("div"),
      `${macros.calories_kcal} kcal · ${macros.protein_g} g protein · ` +
        `${macros.carbs_g} g carbs · ${macros.fat_g} g fat`,
    );
    macroSummary.className = "macros mono";

    const details = document.createElement("details");
    const summary = text(document.createElement("summary"), "Shopping list & method");
    const detailsBody = document.createElement("div");
    detailsBody.className = "recipe-details";

    const shoppingHeading = text(
      document.createElement(`h${sectionLevel}`),
      "Shopping list",
    );
    shoppingHeading.className = "recipe-section-title";
    detailsBody.append(shoppingHeading, createShoppingList(meal, ingredientsRoot));

    if ((meal.pantry || []).length) {
      const pantryHeading = text(
        document.createElement(`h${sectionLevel}`),
        "From the cupboard",
      );
      pantryHeading.className = "recipe-section-title";
      const pantry = text(
        document.createElement("p"),
        meal.pantry.map(formatPantryItem).join(", "),
      );
      pantry.className = "recipe-pantry";
      detailsBody.append(pantryHeading, pantry);
    }

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

    details.append(summary, detailsBody);
    article.append(header, description, macroSummary, details);
    return article;
  }

  globalThis.MealRecipeView = {
    createRecipeCard,
    reminderLines,
    shoppingItems,
  };
})();
