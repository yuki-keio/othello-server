cmake_minimum_required(VERSION 3.10)
project(OthelloWasm)

set(CMAKE_CXX_STANDARD 14)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# ソースファイルの設定
set(SOURCE_FILES evaluate_board.cpp)

# emscriptenビルド設定
add_executable(othello_wasm ${SOURCE_FILES})

# WebAssembly出力設定
set_target_properties(othello_wasm PROPERTIES
    LINK_FLAGS "-O3 --bind -s WASM=1 -s MODULARIZE=1 -s EXPORT_NAME='OthelloModule' -s EXPORTED_RUNTIME_METHODS=['ccall','cwrap'] -s ALLOW_MEMORY_GROWTH=1 -s ENVIRONMENT=web,worker"
)

# 出力ファイルの場所を設定
set_target_properties(othello_wasm PROPERTIES
    RUNTIME_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}"
)