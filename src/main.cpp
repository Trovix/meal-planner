#include <algorithm>
#include <cmath>
#include <fstream>
#include <iostream>
#include <map>
#include <sstream>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>
#include <nlohmann/json.hpp>
using json = nlohmann::json;
static json read_json(const std::string& path){std::ifstream f(path);if(!f)throw std::runtime_error("Could not open "+path);json j;f>>j;return j;}
static std::vector<std::string> split_csv(const std::string& s){std::vector<std::string> out;std::stringstream ss(s);std::string item;while(std::getline(ss,item,',')){auto first=item.find_first_not_of(" \t");if(first==std::string::npos)continue;auto last=item.find_last_not_of(" \t");item=item.substr(first,last-first+1);if(!item.empty())out.push_back(item);}return out;}
int main(int argc,char** argv){
 if(argc!=3){std::cerr<<"usage: mealplanner <comma-separated-meal-ids> <request-id>\n";return 2;}
 const auto selected=split_csv(argv[1]); const std::string request_id=argv[2]; if(selected.empty())throw std::runtime_error("No meals selected");
 json meals_db=read_json("data/meals.json"); json ingredients_db=read_json("data/ingredients.json")["ingredients"];
 std::unordered_map<std::string,json> meals; for(const auto& m:meals_db["meals"])meals[m["id"].get<std::string>()]=m;
 struct Qty{double quantity=0.0;std::string unit;}; std::map<std::string,Qty> totals; json selected_meals=json::array(); json macro_totals={{"calories_kcal",0.0},{"protein_g",0.0},{"carbs_g",0.0},{"fat_g",0.0}};
 for(const auto& id:selected){if(!meals.contains(id))throw std::runtime_error("Unknown meal id: "+id);const auto& meal=meals.at(id);selected_meals.push_back({{"id",id},{"name",meal["name"]}});for(auto key:{"calories_kcal","protein_g","carbs_g","fat_g"})macro_totals[key]=macro_totals[key].get<double>()+meal["macros"][key].get<double>();for(const auto& item:meal["buy"]){const std::string iid=item["ingredient_id"];const std::string unit=item["unit"];const double q=item["quantity"];if(totals.contains(iid)&&totals[iid].unit!=unit)throw std::runtime_error("Unit mismatch for "+iid);totals[iid].unit=unit;totals[iid].quantity+=q;}}
 json shopping=json::array(); for(const auto& [iid,q]:totals){if(!ingredients_db.contains(iid))throw std::runtime_error("Missing ingredient metadata: "+iid);const auto& meta=ingredients_db.at(iid);const double pack_q=meta["pack_quantity"];const std::string pack_unit=meta["pack_unit"];if(pack_unit!=q.unit)throw std::runtime_error("Pack unit mismatch for "+iid);const int packs=std::max(1,(int)std::ceil(q.quantity/pack_q));shopping.push_back({{"ingredient_id",iid},{"name",meta["name"]},{"category",meta["category"]},{"needed",q.quantity},{"unit",q.unit},{"pack_quantity",pack_q},{"pack_unit",pack_unit},{"packs",packs},{"buy_text",std::to_string(packs)+" x "+meta["name"].get<std::string>()}});}
 std::sort(shopping.begin(),shopping.end(),[](const json&a,const json&b){if(a["category"]==b["category"])return a["name"]<b["name"];return a["category"]<b["category"];});
 json out={{"request_id",request_id},{"selected_meals",selected_meals},{"shopping_list",shopping},{"macro_totals",macro_totals}};std::ofstream f("output/latest.json");if(!f)throw std::runtime_error("Could not create output/latest.json");f<<out.dump(2)<<"\n";std::cout<<out.dump(2)<<"\n";
}
