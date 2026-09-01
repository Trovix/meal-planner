# Adding recipes

The source of truth is `data/recipes/*.json`. The deployed `data/meals.json` is generated automatically.

## Browser editor

Open `/add-recipe.html`, fill in the form, validate it with the C++ WASM validator, then download the JSON file.

Move the file into `data/recipes/`, then:

```bash
git add data/recipes/<recipe>.json
git commit -m "Add <recipe name>"
git push
```

CI rejects malformed JSON, duplicate recipe IDs, unknown ingredient IDs, non-positive quantities and unit mismatches.

## New ingredients

If a recipe needs an ingredient that does not exist in `data/ingredients.json`, add it there first:

```json
"new_ingredient": {
  "name": "Display name",
  "category": "Produce",
  "pack_quantity": 250,
  "pack_unit": "g"
}
```

Then use `new_ingredient` in the recipe JSON. After deployment, the browser editor will also include it automatically.

## Pantry items

Pantry IDs are recorded on recipes for future inventory features but are not included in the generated shopping list.
