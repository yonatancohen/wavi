<template>
  <div class="app">
    <nav class="sidebar">
      <div class="logo">
        <span class="logo-dot">●</span>
        <span class="logo-text">Wa<strong>vi</strong></span>
      </div>
      <div class="nav-section">
        <span class="nav-label">Overview</span>
        <RouterLink to="/" class="nav-item"><span class="icon">⬡</span> Dashboard<span v-if="agentConnected" class="status-dot" /></RouterLink>
        <RouterLink to="/groups" class="nav-item"><span class="icon">💬</span> Groups</RouterLink>
        <RouterLink to="/activity" class="nav-item"><span class="icon">↩</span> Activity</RouterLink>
      </div>
      <div class="nav-section">
        <span class="nav-label">Agent</span>
        <RouterLink to="/connect" class="nav-item"><span class="icon">🔗</span> WhatsApp</RouterLink>
      </div>
    </nav>
    <main class="main"><RouterView /></main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { apiFetch } from './lib/api'
const agentConnected = ref(false)
onMounted(async () => {
  try { const s = await apiFetch<{connected:boolean}>('/agent/status'); agentConnected.value = s.connected } catch {}
})
</script>

<style>
:root {
  --bg:#0d0f12;--surface:#141720;--surface2:#1c2030;--border:#252a3a;
  --accent:#4fffb0;--accent2:#7c6fff;--wa:#25d366;
  --text:#e8eaf0;--muted:#6b7494;--danger:#ff5f5f;--warn:#ffb84d;
}
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
.app{display:flex;min-height:100vh}
.sidebar{width:220px;min-height:100vh;background:var(--surface);border-right:1px solid var(--border);padding:24px 0;display:flex;flex-direction:column;gap:4px;flex-shrink:0}
.logo{padding:0 20px 24px;display:flex;align-items:center;gap:10px}
.logo-dot{font-size:20px;color:var(--wa)}
.logo-text{font-size:18px;font-weight:700;letter-spacing:-0.5px}
.logo-text strong{color:var(--accent)}
.nav-section{padding:0 12px;margin-bottom:8px}
.nav-label{font-size:10px;font-weight:600;letter-spacing:1.5px;color:var(--muted);text-transform:uppercase;padding:8px 8px 4px;display:block}
.nav-item{display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:8px;font-size:13.5px;font-weight:500;color:var(--muted);text-decoration:none;transition:all 0.15s}
.nav-item:hover{background:var(--surface2);color:var(--text)}
.nav-item.router-link-active{background:rgba(79,255,176,0.1);color:var(--accent)}
.icon{font-size:16px;width:20px;text-align:center}
.status-dot{width:7px;height:7px;border-radius:50%;background:var(--accent);margin-left:auto;box-shadow:0 0 6px var(--accent);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
.main{flex:1;overflow-x:hidden}
</style>
