# Adding recipes

The source of truth is `data/recipes/*.json`. The deployed `data/meals.json` is generated automatically.

## Browser editor

Open `/add-recipe.html` and complete the recipe form. Shopping ingredients and pantry ingredients are deliberately separate:

- **Shopping ingredients** are included in the recipe's HTML shopping list and iPhone reminder list.
- **Pantry ingredients (assumed in stock)** are excluded from reminders but always shown on expanded recipe cards.

Pantry ingredients are selected from the searchable central catalogue in `data/pantry.json`. The form validates the recipe and shows a real recipe-card preview before publishing.

## New shopping ingredients

If an ingredient is absent from `data/ingredients.json`, define its display name, shopping category, normal pack quantity and unit in the form. Publishing adds it to the central catalogue before saving the recipe.

The pack unit must match the unit used by the recipe so the planner can calculate the number of packs to buy.

## New pantry ingredients

If a shelf-stable ingredient that is normally assumed to be in stock is absent from `data/pantry.json`, add its stable ID and display name in the form. It then becomes available in the searchable pantry selector.

Every selected pantry ID must exist in the catalogue. An ingredient cannot appear in both the shopping and pantry sections of the same recipe.

## Optional substitutions

Substitutions identify the standard shopping ingredient IDs they replace and the alternative shopping items to use. Expanded recipe cards provide a checkbox for each substitution. Selecting it immediately updates the visible shopping list, pantry list and reminder payload.

## Manual workflow

Downloaded recipe JSON can be placed in `data/recipes/`, then validated with:

```bash
python3 tools/build_registry.py \
  --out data/meals.json \
  --ingredients-out /tmp/ingredients.json \
  --pantry-out /tmp/pantry.json
```

CI rejects malformed recipes, duplicate or unknown IDs, conflicting pantry/shopping selections, non-positive quantities, unit mismatches and invalid substitutions.
