use sysinfo::System;
use std::time::Instant;

#[derive(Debug)]
pub struct SystemSampler {
    sys: System,
    last_cpu_refresh: Instant,
}

impl Default for SystemSampler {
    fn default() -> Self {
        Self::new()
    }
}

impl SystemSampler {
    pub fn new() -> Self {
        let mut sys = System::new();
        sys.refresh_memory();
        sys.refresh_cpu_usage();
        std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
        sys.refresh_cpu_usage();
        Self {
            sys,
            last_cpu_refresh: Instant::now(),
        }
    }

    pub fn refresh(&mut self) {
        self.sys.refresh_memory();
    }

    pub fn refresh_cpu(&mut self) {
        if self.last_cpu_refresh.elapsed() < sysinfo::MINIMUM_CPU_UPDATE_INTERVAL {
            return;
        }
        self.sys.refresh_cpu_usage();
        self.last_cpu_refresh = Instant::now();
    }

    pub fn total_ram_bytes(&self) -> u64 {
        self.sys.total_memory()
    }

    pub fn used_ram_bytes(&self) -> u64 {
        self.sys.used_memory()
    }

    pub fn cpu_usage(&self) -> f32 {
        self.sys.global_cpu_usage()
    }
}
