//! Real-weight showcase: Qwen2.5-3B (LLM) + DreamShaper-8-LCM (image) + TTS Kokoro (speech).
//! Run: cargo run --example real_showcase --features tts-kokoro
//! Outputs: /tmp/gabriel_showcase.png, /tmp/gabriel_showcase.wav + live LLM tokens.
//!
//! Image synthesis uses 4-step LCM (FP16, 512x512, CFG 1.5).

use gabriel_lib::core::EngineConfig;
use gabriel_lib::core::engine::EngineState;
use gabriel_lib::types::{ChatEvent, GenParams, ModelType};
use std::time::Instant;

const LLM_ID: &str = "qwen2.5-3b-instruct";
const IMAGE_ID: &str = "dreamshaper-8";
const TTS_ID: &str = "tts_kokoro";

#[tokio::main(flavor = "multi_thread", worker_threads = 8)]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter("info,gabriel_lib=info")
        .init();

    let mut config = EngineConfig::default();
    config.max_loaded_models = 8;
    let engine = EngineState::new(config);

    println!("=== Gabriel REAL showcase (Optimized Pipeline) ===");

    // 1. Load real weights CONCURRENTLY for faster startup
    println!("\n--- Loading Models ---");
    let t0 = Instant::now();

    let (llm_res, img_res, tts_res) = tokio::join!(
        engine.load_model(LLM_ID, ModelType::Llm, None),
        engine.load_model(IMAGE_ID, ModelType::Image, None),
        engine.load_model(TTS_ID, ModelType::Tts, None)
    );

    llm_res.expect("load real LLM (Qwen2.5-3B GGUF)");
    img_res.expect("load real image (DreamShaper-8-LCM, 4-step)");
    match tts_res {
        Ok(_) => println!("[tts] loaded successfully"),
        Err(e) => println!("[tts] load failed (need --features tts-kokoro): {e}"),
    }
    println!("All models loaded in {:.1}s", t0.elapsed().as_secs_f32());

    let snap = engine.telemetry_snapshot();
    println!(
        "residency: engine_tracked={}MB vram_used={}MB total={}MB gpu={}",
        snap.engine_resident_bytes / 1_000_000,
        snap.vram_used_bytes / 1_000_000,
        snap.vram_total_bytes / 1_000_000,
        snap.gpu_name,
    );
    for m in &snap.loaded_models {
        println!(
            "  model={} type={:?} residency={:?} vram={}MB",
            m.id,
            m.model_type,
            m.residency,
            m.vram_bytes / 1_000_000
        );
    }

    // 2. Start Image Gen in the BACKGROUND (Image of an Angel)
    println!("\n--- [1/3] Dispatched Image Generation (Running in background) ---");
    let image_t0 = Instant::now();
    let img_prompt = "Epic back view silhouette of a lone archangel standing on a high mountain peak, enormous feathered wings clearly separated and spread wide against a giant glowing full moon, dark dramatic night sky, crisp cinematic lighting".to_string();
    let img_rx = engine
        .submit_image(IMAGE_ID, img_prompt, 512, 512)
        .await
        .expect("submit image");

    // 3. LLM streaming (Explaining Gabriel)
    println!("\n--- [2/3] LLM (Explaining Gabriel) ---");
    let llm_prompt = "Explain what the Gabriel AI engine is, in 2 short sentences.";
    let params = GenParams {
        max_tokens: 128,
        temperature: 0.7,
    };
    let llm_t0 = Instant::now();

    let mut rx = engine
        .submit_chat(LLM_ID, llm_prompt.to_string(), params)
        .await
        .expect("submit chat");
    let mut full_llm_text = String::new();
    let mut tokens = 0u32;

    while let Some(ev) = rx.recv().await {
        match ev {
            ChatEvent::Token(piece) => {
                print!("{piece}");
                use std::io::Write;
                let _ = std::io::stdout().flush();
                full_llm_text.push_str(&piece);
                tokens += 1;
            }
            ChatEvent::Done { finish_reason } => {
                println!(
                    "\n[done: {finish_reason}] {tokens} tokens in {:.1}s ({:.1} tok/s)",
                    llm_t0.elapsed().as_secs_f32(),
                    tokens as f32 / llm_t0.elapsed().as_secs_f32().max(0.01)
                );
                break;
            }
            ChatEvent::Failed(e) => panic!("real LLM failed: {e}"),
        }
    }
    assert!(
        !full_llm_text.contains("deterministic stub backend"),
        "STUB LEAKED into LLM output!"
    );

    // 4. TTS (Speaking the dynamic LLM text)
    println!("\n--- [3/3] Speech (Synthesizing LLM output) ---");
    if engine.list_models().iter().any(|m| m.id == TTS_ID) {
        let tts_t0 = Instant::now();
        // Pipe the LLM text directly into the TTS engine
        let sp_rx = engine
            .submit_speech(TTS_ID, full_llm_text.clone(), "nova".to_string())
            .await
            .expect("submit speech");
        let wav = tokio::time::timeout(std::time::Duration::from_secs(300), sp_rx)
            .await
            .expect("speech timeout")
            .expect("oneshot dropped")
            .expect("speech backend failed");
        println!(
            "speech: {} bytes in {:.1}s",
            wav.len(),
            tts_t0.elapsed().as_secs_f32()
        );
        assert_eq!(&wav[..4], b"RIFF", "expected WAV/RIFF");
        std::fs::write("/tmp/gabriel_showcase.wav", &wav).expect("write wav");
        println!("saved /tmp/gabriel_showcase.wav (RIFF OK)");
    } else {
        println!(
            "skipped (TTS model not loaded — rerun with --features tts-kokoro for real voice)"
        );
    }

    // 5. Collect the background image (which was generating concurrently)
    println!("\n--- Collecting Background Image ---");
    eprintln!("DEBUG real_showcase: img_rx={:p}", &img_rx);
    let png = tokio::time::timeout(std::time::Duration::from_secs(300), img_rx)
        .await
        .expect("image timeout")
        .expect("oneshot dropped")
        .expect("image backend failed");
    println!(
        "image: {} bytes in {:.1}s",
        png.len(),
        image_t0.elapsed().as_secs_f32()
    );
    assert!(
        png.len() >= 4 && &png[..4] == b"\x89PNG",
        "expected real PNG from diffusion, got stub BMP?"
    );
    std::fs::write("/tmp/gabriel_showcase.png", &png).expect("write png");
    println!("saved /tmp/gabriel_showcase.png (PNG magic OK, NOT stub BMP)");

    let snap = engine.telemetry_snapshot();
    println!("\n=== DONE: Pipeline Complete ===");
    println!(
        "engine_tracked={}MB vram_used={}MB/models={}",
        snap.engine_resident_bytes / 1_000_000,
        snap.vram_used_bytes / 1_000_000,
        snap.loaded_models.len()
    );
}
