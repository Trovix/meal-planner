#include "mealplanner/planner.hpp"
#include <chrono>
#include <fstream>
#include <iostream>
#include <sstream>
#include <stdexcept>
#include <string>
static std::string read_file(const std::string& p){std::ifstream f(p);if(!f)throw std::runtime_error("Could not open "+p);std::ostringstream b;b<<f.rdbuf();return b.str();}
int main(int argc,char**argv){if(argc<4||argc>5){std::cerr<<"usage: mealplanner <meals.json> <ingredients.json> <count> [seed]\n";return 2;}try{int count=std::stoi(argv[3]);std::uint32_t seed=argc==5?(std::uint32_t)std::stoul(argv[4]):(std::uint32_t)std::chrono::high_resolution_clock::now().time_since_epoch().count();std::cout<<mealplanner::generate_plan_json(read_file(argv[1]),read_file(argv[2]),count,seed)<<'\n';}catch(const std::exception&e){std::cerr<<e.what()<<'\n';return 1;}}
