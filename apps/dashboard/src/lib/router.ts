import { createRouter, createWebHistory } from 'vue-router';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: () => import('../views/DashboardView.vue') },
    { path: '/groups', name: 'groups', component: () => import('../views/GroupsView.vue') },
    { path: '/groups/:id', name: 'group', component: () => import('../views/GroupDetailView.vue') },
    { path: '/activity', name: 'activity', component: () => import('../views/ActivityView.vue') },
    { path: '/test-chat', name: 'test-chat', component: () => import('../views/TestChatView.vue') },
    { path: '/connect', name: 'connect', component: () => import('../views/ConnectView.vue') },
  ],
});

export default router;
