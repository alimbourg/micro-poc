## resvg
git clone https://github.com/yisibl/resvg-js
cd resvg-js
brew install cargo
npm install
npm run build
mv target/release/libresvg_js.dylib ..

but unfortunately only an .asPng() function, to get pixmap data...

### To add a RAW pixmap access (a Uint8 width*height*rgba buffer)
in lib.rs
#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
#[cfg_attr(not(target_arch = "wasm32"), napi)]
impl RenderedImage {

    #[cfg(not(target_arch = "wasm32"))]
    #[napi]
    /// Write the image data to Buffer
    pub fn as_buffer(&self) -> Result<Buffer, NapiError> {
        let buffer = self.pix.data();
        Ok(buffer.into())
    }
...
