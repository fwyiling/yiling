// no console window alongside the app on Windows
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    studio_lib::run()
}
