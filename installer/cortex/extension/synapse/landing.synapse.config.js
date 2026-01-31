self.SYNAPSE_CONFIG = { 
    // ============================================
    // GENÉRICAS (ya las tienes)
    // ============================================
    profileId: '14c11dbf-7f2a-43be-beba-7ae757cc7486', 
    bridge_name: 'com.bloom.synapse.14c11dbf',
    launchId: "017_14c11dbf_085448",
    profile_alias: "MasterWorker",
    extension_id: "hpblclepliicmihaplldignhjdggnkdh",
    total_launches: 42,
    uptime: 86400,
    intents_done: 128,
    last_synch: "2026-01-22T10:30:00Z",

    // ============================================
    // NUEVAS PARA LANDING (agregar estas)
    // ============================================
    
    // Role del perfil (se muestra debajo del alias)
    role: "MasterWorker", // o "Worker", "Specialist", etc.
    
    // Linked accounts (array de cuentas vinculadas)
    linked_accounts: [
        {
            provider: "Google",
            email: "user@example.com",
            username: null, // opcional si no hay username
            status: "active" // "active" | "inactive" | "error"
        },
        {
            provider: "GitHub",
            email: null,
            username: "youruser",
            status: "active"
        }
    ],
    
    // System info timestamps
    created_at: "2025-12-01T08:00:00Z", // cuando se creó el perfil
    last_launch_at: "2026-01-22T08:54:48Z" // último lanzamiento
};