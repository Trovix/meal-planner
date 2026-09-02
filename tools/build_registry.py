#!/usr/bin/env python3
import argparse
import json
import re
import sys
from pathlib import Path

MACRO_FIELDS = ("calories_kcal", "protein_g", "carbs_g", "fat_g")
MEAL_TYPES = {"breakfast", "lunch", "dinner"}
SAFE_ID = re.compile(r"^[a-z0-9_]{1,64}$")


def fail(message):
    raise ValueError(message)


def load(path):
    try:
        return json.loads(Path(path).read_text(encoding="utf-8"))
    except json.JSONDecodeError as error:
        fail(f"{path}: invalid JSON: {error}")


def valid_id(value):
    return isinstance(value, str) and SAFE_ID.fullmatch(value) is not None


def validate_ingredient_definition(ingredient_id, metadata, path):
    if not valid_id(ingredient_id):
        fail(f"{path}: invalid ingredient id '{ingredient_id}'")
    if not isinstance(metadata, dict):
        fail(f"{path}: ingredient definition '{ingredient_id}' must be an object")
    for key in ("name", "category", "pack_quantity", "pack_unit"):
        if key not in metadata:
            fail(f"{path}: ingredient definition '{ingredient_id}' missing '{key}'")
    if not isinstance(metadata["name"], str) or not metadata["name"].strip():
        fail(f"{path}: ingredient '{ingredient_id}' name must be non-empty")
    if not isinstance(metadata["category"], str) or not metadata["category"].strip():
        fail(f"{path}: ingredient '{ingredient_id}' category must be non-empty")
    if not isinstance(metadata["pack_quantity"], (int, float)) or metadata["pack_quantity"] <= 0:
        fail(f"{path}: ingredient '{ingredient_id}' pack_quantity must be greater than zero")
    if not isinstance(metadata["pack_unit"], str) or not metadata["pack_unit"].strip():
        fail(f"{path}: ingredient '{ingredient_id}' pack_unit must be non-empty")


def validate_pantry_definition(pantry_id, metadata, path):
    if not valid_id(pantry_id):
        fail(f"{path}: invalid pantry id '{pantry_id}'")
    if not isinstance(metadata, dict):
        fail(f"{path}: pantry definition '{pantry_id}' must be an object")
    if not isinstance(metadata.get("name"), str) or not metadata["name"].strip():
        fail(f"{path}: pantry ingredient '{pantry_id}' name must be non-empty")


def validate_buy_items(items, path, ingredients, label="buy"):
    if not isinstance(items, list) or (label == "buy" and not items):
        fail(f"{path}: {label} must be a non-empty array")
    seen = set()
    for item in items:
        if not isinstance(item, dict):
            fail(f"{path}: every {label} item must be an object")
        ingredient_id = item.get("ingredient_id")
        if ingredient_id not in ingredients:
            fail(f"{path}: unknown ingredient_id '{ingredient_id}'")
        if ingredient_id in seen:
            fail(f"{path}: duplicate ingredient_id '{ingredient_id}' in {label}")
        seen.add(ingredient_id)
        quantity = item.get("quantity")
        if not isinstance(quantity, (int, float)) or quantity <= 0:
            fail(f"{path}: quantity for '{ingredient_id}' must be greater than zero")
        expected = ingredients[ingredient_id]["pack_unit"]
        if item.get("unit") != expected:
            fail(
                f"{path}: unit mismatch for '{ingredient_id}': "
                f"recipe={item.get('unit')} catalogue={expected}"
            )
    return seen


def validate_substitutions(recipe, path, ingredients, pantry):
    substitutions = recipe.get("substitutions", [])
    if not isinstance(substitutions, list):
        fail(f"{path}: substitutions must be an array")
    buy_ids = {item["ingredient_id"] for item in recipe["buy"]}
    pantry_ids = set(recipe["pantry"])
    seen = set()
    for substitution in substitutions:
        if not isinstance(substitution, dict):
            fail(f"{path}: every substitution must be an object")
        substitution_id = substitution.get("id")
        if not valid_id(substitution_id) or substitution_id in seen:
            fail(f"{path}: invalid or duplicate substitution id '{substitution_id}'")
        seen.add(substitution_id)
        if not isinstance(substitution.get("label"), str) or not substitution["label"].strip():
            fail(f"{path}: substitution '{substitution_id}' needs a label")
        if not isinstance(substitution.get("note"), str) or not substitution["note"].strip():
            fail(f"{path}: substitution '{substitution_id}' needs a note")
        replaces = substitution.get("replaces")
        if not isinstance(replaces, list) or not replaces or len(replaces) != len(set(replaces)):
            fail(f"{path}: substitution '{substitution_id}' needs unique replacement IDs")
        if any(ingredient_id not in buy_ids for ingredient_id in replaces):
            fail(f"{path}: substitution '{substitution_id}' replaces an ingredient not in the recipe")
        validate_buy_items(substitution.get("buy"), path, ingredients, "substitution buy")
        omit_pantry = substitution.get("omit_pantry", [])
        if not isinstance(omit_pantry, list) or len(omit_pantry) != len(set(omit_pantry)):
            fail(f"{path}: substitution '{substitution_id}' has invalid omit_pantry IDs")
        if any(item not in pantry or item not in pantry_ids for item in omit_pantry):
            fail(f"{path}: substitution '{substitution_id}' omits an unknown recipe pantry item")


def validate_recipe(recipe, path, ingredients, pantry):
    if not isinstance(recipe, dict):
        fail(f"{path}: recipe must be an object")
    for key in ("id", "name", "description", "servings", "active", "meal_types", "macros", "buy", "pantry", "instructions"):
        if key not in recipe:
            fail(f"{path}: missing '{key}'")
    if not valid_id(recipe["id"]):
        fail(f"{path}: id must use lowercase letters, numbers and underscores")
    if not isinstance(recipe["name"], str) or not recipe["name"].strip():
        fail(f"{path}: name must be non-empty")
    if not isinstance(recipe["description"], str) or not recipe["description"].strip():
        fail(f"{path}: description must be non-empty")
    if not isinstance(recipe["servings"], int) or not 1 <= recipe["servings"] <= 20:
        fail(f"{path}: servings must be between 1 and 20")
    if not isinstance(recipe["active"], bool):
        fail(f"{path}: active must be true or false")
    if (
        not isinstance(recipe["meal_types"], list)
        or not recipe["meal_types"]
        or any(not isinstance(meal_type, str) for meal_type in recipe["meal_types"])
        or len(recipe["meal_types"]) != len(set(recipe["meal_types"]))
        or any(meal_type not in MEAL_TYPES for meal_type in recipe["meal_types"])
    ):
        fail(f"{path}: meal_types must contain unique breakfast, lunch or dinner values")
    if not isinstance(recipe["macros"], dict):
        fail(f"{path}: macros must be an object")
    for key in MACRO_FIELDS:
        value = recipe["macros"].get(key)
        if not isinstance(value, (int, float)) or value < 0:
            fail(f"{path}: macros.{key} must be a non-negative number")
    buy_ids = validate_buy_items(recipe["buy"], path, ingredients)
    if not isinstance(recipe["pantry"], list) or len(recipe["pantry"]) != len(set(recipe["pantry"])):
        fail(f"{path}: pantry must contain unique IDs")
    for pantry_id in recipe["pantry"]:
        if pantry_id not in pantry:
            fail(f"{path}: unknown pantry id '{pantry_id}'")
        if pantry_id in buy_ids:
            fail(f"{path}: '{pantry_id}' cannot be both purchased and pantry")
    if (
        not isinstance(recipe["instructions"], list)
        or not recipe["instructions"]
        or any(not isinstance(step, str) or not step.strip() for step in recipe["instructions"])
    ):
        fail(f"{path}: instructions must be a non-empty string array")
    if "make_ahead" in recipe:
        make_ahead = recipe["make_ahead"]
        expected = {"component", "max_refrigerated_hours", "instructions", "storage", "day_of"}
        if not isinstance(make_ahead, dict) or set(make_ahead) != expected:
            fail(f"{path}: make_ahead must contain exactly component, max_refrigerated_hours, instructions, storage and day_of")
        if not isinstance(make_ahead["component"], str) or not make_ahead["component"].strip():
            fail(f"{path}: make_ahead.component must be a non-empty string")
        hours = make_ahead["max_refrigerated_hours"]
        if not isinstance(hours, int) or isinstance(hours, bool) or not 1 <= hours <= 48:
            fail(f"{path}: make_ahead.max_refrigerated_hours must be an integer from 1 to 48")
        for key in ("instructions", "day_of"):
            steps = make_ahead[key]
            if not isinstance(steps, list) or not steps or any(not isinstance(step, str) or not step.strip() for step in steps):
                fail(f"{path}: make_ahead.{key} must be a non-empty string array")
        if not isinstance(make_ahead["storage"], str) or not make_ahead["storage"].strip():
            fail(f"{path}: make_ahead.storage must be a non-empty string")
    validate_substitutions(recipe, path, ingredients, pantry)


def merge_definitions(loaded, ingredients, pantry):
    for path, recipe in loaded:
        ingredient_definitions = recipe.get("ingredient_definitions", {})
        if not isinstance(ingredient_definitions, dict):
            fail(f"{path}: ingredient_definitions must be an object")
        for ingredient_id, metadata in ingredient_definitions.items():
            validate_ingredient_definition(ingredient_id, metadata, path)
            if ingredient_id in ingredients:
                fail(f"{path}: ingredient definition '{ingredient_id}' conflicts with the catalogue")
            ingredients[ingredient_id] = metadata

        pantry_definitions = recipe.get("pantry_definitions", {})
        if not isinstance(pantry_definitions, dict):
            fail(f"{path}: pantry_definitions must be an object")
        for pantry_id, metadata in pantry_definitions.items():
            validate_pantry_definition(pantry_id, metadata, path)
            if pantry_id in pantry:
                fail(f"{path}: pantry definition '{pantry_id}' conflicts with the catalogue")
            pantry[pantry_id] = metadata


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--recipes", default="data/recipes")
    parser.add_argument("--ingredients", default="data/ingredients.json")
    parser.add_argument("--pantry", default="data/pantry.json")
    parser.add_argument("--out", required=True)
    parser.add_argument("--ingredients-out")
    parser.add_argument("--pantry-out")
    args = parser.parse_args()

    ingredient_root = load(args.ingredients)
    pantry_root = load(args.pantry)
    base_ingredients = ingredient_root.get("ingredients")
    base_pantry = pantry_root.get("pantry")
    if not isinstance(base_ingredients, dict):
        fail("ingredients.json must contain an ingredients object")
    if not isinstance(base_pantry, dict):
        fail("pantry.json must contain a pantry object")

    ingredients = dict(base_ingredients)
    pantry = dict(base_pantry)
    loaded = []
    for path in sorted(Path(args.recipes).glob("*.json")):
        if path.name.startswith("_"):
            continue
        loaded.append((path, load(path)))

    merge_definitions(loaded, ingredients, pantry)
    recipes = []
    seen = set()
    for path, recipe in loaded:
        validate_recipe(recipe, path, ingredients, pantry)
        if recipe["id"] in seen:
            fail(f"{path}: duplicate recipe id '{recipe['id']}'")
        seen.add(recipe["id"])
        recipes.append(
            {
                key: value
                for key, value in recipe.items()
                if key not in ("ingredient_definitions", "pantry_definitions")
            }
        )
    if not recipes:
        fail("No recipes found")

    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({"meals": recipes}, indent=2) + "\n", encoding="utf-8")
    if args.ingredients_out:
        ingredient_output = Path(args.ingredients_out)
        ingredient_output.parent.mkdir(parents=True, exist_ok=True)
        ingredient_output.write_text(
            json.dumps({"ingredients": ingredients}, indent=2) + "\n", encoding="utf-8"
        )
    if args.pantry_out:
        pantry_output = Path(args.pantry_out)
        pantry_output.parent.mkdir(parents=True, exist_ok=True)
        pantry_output.write_text(
            json.dumps({"pantry": pantry}, indent=2) + "\n", encoding="utf-8"
        )
    print(f"Built {len(recipes)} recipes -> {output}")


if __name__ == "__main__":
    try:
        main()
    except ValueError as error:
        print(error, file=sys.stderr)
        raise SystemExit(1)
