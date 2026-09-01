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

  function randomSeed() {
    return globalThis.crypto?.getRandomValues
      ? crypto.getRandomValues(new Uint32Array(1))[0]
      : Date.now() >>> 0;
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
      generateButton.disabled = false;
      status.textContent = "";
    } catch (error) {
      status.textContent = error.message || "Planner failed to load.";
      status.classList.add("error");
    }
  }

  function renderPlan(plan) {
    mealsElement.replaceChildren();

    for (const selected of plan.selected_meals) {
      const meal = mealsRoot.meals.find((candidate) => candidate.id === selected.id);
      if (!meal) continue;
      mealsElement.append(
        MealRecipeView.createRecipeCard(meal, ingredientsRoot, pantryRoot, { headingLevel: 3 }),
      );
    }

    const mealType = mealTypeSelect.value;
    const pluralLabels = {
      breakfast: "Breakfasts",
      lunch: "Lunches",
      dinner: "Dinners",
      snack: "Snacks",
    };
    resultHeading.textContent = pluralLabels[mealType] || "Meals";
    const macros = plan.macro_totals;
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
    let pointer = 0;

    try {
      pointer = generatePlanForType(
        mealsJson,
        ingredientsJson,
        3,
        randomSeed(),
        mealTypeSelect.value,
      );
      if (!pointer) throw new Error("C++ planner returned no result.");

      const plan = JSON.parse(module.UTF8ToString(pointer));
      if (plan.error) throw new Error(plan.error);

      renderPlan(plan);
      status.textContent = `Three ${mealTypeSelect.value ? `${mealTypeSelect.value} recipes` : "recipes"} rolled.`;
    } catch (error) {
      status.textContent = error.message || "Could not generate a meal plan.";
      status.classList.add("error");
    } finally {
      if (pointer) freeResult(pointer);
    }
  });

  mealTypeSelect.addEventListener("change", () => {
    const labels = {
      breakfast: "breakfasts",
      lunch: "lunches",
      dinner: "dinners",
      snack: "snacks",
    };
    generateButton.textContent = `Roll for three ${labels[mealTypeSelect.value] || "meals"}`;
    result.classList.add("hidden");
    status.textContent = "";
  });

  initialise();
})();
