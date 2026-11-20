fn main() {
    // the client is built in with include_str! (src/lib.rs), which rebuilds on its change
    println!("cargo:rerun-if-changed=../../clients/studio-client.user.js");
    println!("cargo:rerun-if-changed=../../clients/starblast-r124.user.js");
    tauri_build::build()
}
