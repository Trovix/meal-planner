(() => {
  const status = document.querySelector("#status");
  const registry = document.querySelector("#registry");
  const filterControls = document.querySelector("#meal-type-filters");

  let meals = [];
  let ingredientsRoot;
  let pantryRoot;
  let selectedMealType = "";

  function render() {
    const visibleMeals = selectedMealType
      ? meals.filter((meal) => meal.meal_types.includes(selectedMealType))
      : meals;
    registry.replaceChildren(
      ...visibleMeals.map((meal) =>
        MealRecipeView.createRecipeCard(meal, ingredientsRoot, pantryRoot),
      ),
    );
    if (!visibleMeals.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "No recipes match this meal type yet.";
      registry.append(empty);
    }
    status.textContent = `${visibleMeals.length} recipe${visibleMeals.length === 1 ? "" : "s"}.`;
  }

  async function initialise() {
    try {
      const [mealsResponse, ingredientsResponse, pantryResponse] = await Promise.all([
        fetch("data/meals.json", { cache: "no-store" }),
        fetch("data/ingredients.json", { cache: "no-store" }),
        fetch("data/pantry.json", { cache: "no-store" }),
      ]);

      if (!mealsResponse.ok || !ingredientsResponse.ok || !pantryResponse.ok) {
        throw new Error("Could not load recipe registry.");
      }

      const [mealsRoot, loadedIngredients, loadedPantry] = await Promise.all([
        mealsResponse.json(),
        ingredientsResponse.json(),
        pantryResponse.json(),
      ]);
      ingredientsRoot = loadedIngredients;
      pantryRoot = loadedPantry;
      meals = [...(mealsRoot.meals || [])].sort((left, right) =>
        left.name.localeCompare(right.name),
      );
      render();
    } catch (error) {
      status.textContent = error.message || "Could not load registry.";
      status.classList.add("error");
    }
  }

  filterControls.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-meal-type]");
    if (!button) return;
    for (const candidate of filterControls.querySelectorAll("button")) {
      const selected = candidate === button;
      candidate.classList.toggle("is-active", selected);
      candidate.setAttribute("aria-pressed", String(selected));
    }
    selectedMealType = button.dataset.mealType;
    render();
  });

  initialise();
})();
