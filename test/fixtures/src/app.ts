// exact match
app.post("/api/v1/auth/login", (req, res) => {});

// interpolated match
app.get("/api/v1/users/" + userId + "/profile", (req, res) => {});

// exact match for env
const db = process.env.DATABASE_URL;

// inactive comment match
// const redis = process.env.REDIS_CACHE_URL;

import "src/config/index.ts";
