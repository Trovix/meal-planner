#!/usr/bin/env python3
import argparse,json,sys
from pathlib import Path
REQ=("calories_kcal","protein_g","carbs_g","fat_g")
def fail(m): raise ValueError(m)
def load(p):
 try:return json.loads(Path(p).read_text(encoding="utf-8"))
 except json.JSONDecodeError as e:fail(f"{p}: invalid JSON: {e}")
def validate_definition(iid,meta,path):
 if not isinstance(iid,str) or not iid.strip():fail(f"{path}: new ingredient id must be a non-empty string")
 if not isinstance(meta,dict):fail(f"{path}: ingredient definition '{iid}' must be an object")
 for key in ("name","category","pack_quantity","pack_unit"):
  if key not in meta:fail(f"{path}: ingredient definition '{iid}' missing '{key}'")
 if not isinstance(meta["name"],str) or not meta["name"].strip():fail(f"{path}: ingredient '{iid}' name must be non-empty")
 if not isinstance(meta["category"],str) or not meta["category"].strip():fail(f"{path}: ingredient '{iid}' category must be non-empty")
 if not isinstance(meta["pack_quantity"],(int,float)) or meta["pack_quantity"]<=0:fail(f"{path}: ingredient '{iid}' pack_quantity must be greater than zero")
 if not isinstance(meta["pack_unit"],str) or not meta["pack_unit"].strip():fail(f"{path}: ingredient '{iid}' pack_unit must be non-empty")
def validate(r,path,ingredients):
 for k in ("id","name","description","macros","buy","pantry","instructions"):
  if k not in r:fail(f"{path}: missing '{k}'")
 if not isinstance(r["id"],str) or not r["id"].strip():fail(f"{path}: id must be a non-empty string")
 for k in REQ:
  v=r["macros"].get(k)
  if not isinstance(v,(int,float)) or v<0:fail(f"{path}: macros.{k} must be a non-negative number")
 if not isinstance(r["buy"],list):fail(f"{path}: buy must be an array")
 for item in r["buy"]:
  iid=item.get("ingredient_id")
  if iid not in ingredients:fail(f"{path}: unknown ingredient_id '{iid}'")
  q=item.get("quantity")
  if not isinstance(q,(int,float)) or q<=0:fail(f"{path}: quantity for '{iid}' must be greater than zero")
  expected=ingredients[iid]["pack_unit"]
  if item.get("unit")!=expected:fail(f"{path}: unit mismatch for '{iid}': recipe={item.get('unit')} catalogue={expected}")
 if not isinstance(r["pantry"],list):fail(f"{path}: pantry must be an array")
 if not isinstance(r["instructions"],list) or not r["instructions"]:fail(f"{path}: instructions must be a non-empty array")
def main():
 ap=argparse.ArgumentParser();ap.add_argument("--recipes",default="data/recipes");ap.add_argument("--ingredients",default="data/ingredients.json");ap.add_argument("--out",required=True);ap.add_argument("--ingredients-out");a=ap.parse_args()
 root=load(a.ingredients);base=root.get("ingredients")
 if not isinstance(base,dict):fail("ingredients.json must contain an ingredients object")
 ingredients=dict(base);loaded=[]
 for p in sorted(Path(a.recipes).glob("*.json")):
  if p.name.startswith("_"):continue
  r=load(p);loaded.append((p,r))
  defs=r.get("ingredient_definitions",{})
  if not isinstance(defs,dict):fail(f"{p}: ingredient_definitions must be an object")
  for iid,meta in defs.items():
   validate_definition(iid,meta,p)
   if iid in ingredients:fail(f"{p}: ingredient definition '{iid}' conflicts with an existing ingredient")
   ingredients[iid]=meta
 recipes=[];seen=set()
 for p,r in loaded:
  validate(r,p,ingredients)
  if r["id"] in seen:fail(f"{p}: duplicate recipe id '{r['id']}'")
  seen.add(r["id"]);recipes.append(r)
 if not recipes:fail("No recipes found")
 out=Path(a.out);out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps({"meals":recipes},indent=2)+"\n",encoding="utf-8")
 if a.ingredients_out:
  ingredients_out=Path(a.ingredients_out);ingredients_out.parent.mkdir(parents=True,exist_ok=True);ingredients_out.write_text(json.dumps({"ingredients":ingredients},indent=2)+"\n",encoding="utf-8")
 print(f"Built {len(recipes)} recipes -> {out}")
if __name__=="__main__":
 try:main()
 except ValueError as e:print(e,file=sys.stderr);raise SystemExit(1)
