(() => {
  const generateButton = document.querySelector("#generate");
  const status = document.querySelector("#status");
  const result = document.querySelector("#result");
  const mealsElement = document.querySelector("#meals");
  const macroElement = document.querySelector("#macro-summary");
  const mealTypeSelect = document.querySelector("#meal-type");
  const resultHeading = document.querySelector("#result-heading");

  let module;
  let generatePlanForType;
  let freeResult;
  let mealsJson = "";
  let ingredientsJson = "";
  let mealsRoot = null;
  let ingredientsRoot = null;
  let pantryRoot = null;

  const requestedMealCount = 3;
  const mealTypeLabels = {
    breakfast: { singular: "breakfast", plural: "breakfasts", heading: "Breakfasts" },
    lunch: { singular: "lunch", plural: "lunches", heading: "Lunches" },
    dinner: { singular: "dinner", plural: "dinners", heading: "Dinners" },
    snack: { singular: "snack", plural: "snacks", heading: "Snacks" },
  };

  function randomSeed() {
    return globalThis.crypto?.getRandomValues
      ? crypto.getRandomValues(new Uint32Array(1))[0]
      : Date.now() >>> 0;
  }

  function activeMealsForSelectedType() {
    const mealType = mealTypeSelect.value;
    return (mealsRoot?.meals || []).filter(
      (meal) => meal.active !== false && (!mealType || meal.meal_types.includes(mealType)),
    );
  }

  function updateRollAvailability() {
    const mealType = mealTypeSelect.value;
    const labels = mealTypeLabels[mealType] || {
      singular: "meal",
      plural: "meals",
      heading: "Meals",
    };
    const available = activeMealsForSelectedType().length;

    generateButton.textContent = `Roll for three ${labels.plural}`;
    result.classList.add("hidden");
    mealsElement.replaceChildren();
    macroElement.replaceChildren();
    status.className = "status";

    if (!module || available < requestedMealCount) {
      generateButton.disabled = true;
      if (module) {
        status.textContent = available === 0
          ? `No active ${labels.plural} are available yet.`
          : `Only ${available} active ${available === 1 ? labels.singular : labels.plural} ${available === 1 ? "is" : "are"} available. Three are required to roll.`;
      }
      return;
    }

    generateButton.disabled = false;
    status.textContent = "";
  }

  async function initialise() {
    try {
      const [mealsResponse, ingredientsResponse, pantryResponse, wasm] = await Promise.all([
        fetch("data/meals.json", { cache: "no-store" }),
        fetch("data/ingredients.json", { cache: "no-store" }),
        fetch("data/pantry.json", { cache: "no-store" }),
        createMealPlannerModule(),
      ]);

      if (!mealsResponse.ok || !ingredientsResponse.ok || !pantryResponse.ok) {
        throw new Error("Could not load recipe data.");
      }

      [mealsJson, ingredientsJson] = await Promise.all([
        mealsResponse.text(),
        ingredientsResponse.text(),
      ]);
      mealsRoot = JSON.parse(mealsJson);
      ingredientsRoot = JSON.parse(ingredientsJson);
      pantryRoot = await pantryResponse.json();
      module = wasm;
      generatePlanForType = module.cwrap("generate_plan_for_type", "number", [
        "string",
        "string",
        "number",
        "number",
        "string",
      ]);
      freeResult = module.cwrap("free_result", null, ["number"]);
      updateRollAvailability();
    } catch (error) {
      status.textContent = error.message || "Planner failed to load.";
      status.classList.add("error");
    }
  }

  function renderPlan(plan) {
    if (!Array.isArray(plan.selected_meals) || plan.selected_meals.length !== requestedMealCount) {
      throw new Error("The planner did not return exactly three recipes. Please roll again.");
    }

    const selectedIds = plan.selected_meals.map((selected) => selected.id);
    if (new Set(selectedIds).size !== requestedMealCount) {
      throw new Error("The planner returned a duplicate recipe. Please roll again.");
    }

    const cards = plan.selected_meals.map((selected) => {
      const meal = mealsRoot.meals.find((candidate) => candidate.id === selected.id);
      if (!meal) throw new Error(`Recipe '${selected.id}' is missing from the loaded catalogue.`);
      return MealRecipeView.createRecipeCard(
        meal,
        ingredientsRoot,
        pantryRoot,
        { headingLevel: 3 },
      );
    });

    const cardFragment = document.createDocumentFragment();
    cardFragment.append(...cards);

    const mealType = mealTypeSelect.value;
    resultHeading.textContent = mealTypeLabels[mealType]?.heading || "Meals";
    const macros = plan.macro_totals;
    mealsElement.replaceChildren(cardFragment);
    macroElement.replaceChildren(
      Object.assign(document.createElement("p"), {
        textContent:
          `${Math.round(macros.calories_kcal)} kcal · ` +
          `${Math.round(macros.protein_g)} g protein · ` +
          `${Math.round(macros.carbs_g)} g carbs · ` +
          `${Math.round(macros.fat_g)} g fat`,
      }),
      Object.assign(document.createElement("p"), {
        textContent: `Totals for the three rolled ${mealType ? `${mealType} recipes` : "recipes"}.`,
      }),
    );
    result.classList.remove("hidden");
  }

  generateButton.addEventListener("click", () => {
    status.className = "status";
    status.textContent = "Rolling…";
    result.classList.add("hidden");
    let pointer = 0;

    try {
      if (activeMealsForSelectedType().length < requestedMealCount) {
        updateRollAvailability();
        return;
      }

      pointer = generatePlanForType(
        mealsJson,
        ingredientsJson,
        requestedMealCount,
        randomSeed(),
        mealTypeSelect.value,
      );
      if (!pointer) throw new Error("C++ planner returned no result.");

      const plan = JSON.parse(module.UTF8ToString(pointer));
      if (plan.error) throw new Error(plan.error);

      renderPlan(plan);
      status.textContent = `Three ${mealTypeSelect.value ? `${mealTypeSelect.value} recipes` : "recipes"} rolled.`;
    } catch (error) {
      result.classList.add("hidden");
      mealsElement.replaceChildren();
      macroElement.replaceChildren();
      status.textContent = error.message || "Could not generate a meal plan.";
      status.classList.add("error");
    } finally {
      if (pointer) freeResult(pointer);
    }
  });

  mealTypeSelect.addEventListener("change", () => {
    updateRollAvailability();
  });

  initialise();
})();
