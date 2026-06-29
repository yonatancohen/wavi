import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { loginRedirectTarget } from './login-redirect';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('../views/LoginView.vue'),
      meta: { public: true },
    },
    { path: '/dashboard', redirect: { name: 'dashboard' } },
    { path: '/', name: 'dashboard', component: () => import('../views/DashboardView.vue') },
    { path: '/groups', name: 'groups', component: () => import('../views/GroupsView.vue') },
    {
      path: '/groups/:id/:tab?',
      name: 'group',
      component: () => import('../views/GroupDetailView.vue'),
    },
    { path: '/activity', name: 'activity', component: () => import('../views/ActivityView.vue') },
    { path: '/live-log', name: 'live-log', component: () => import('../views/LiveLogView.vue') },
    { path: '/reminders', name: 'reminders', component: () => import('../views/RemindersView.vue') },
    { path: '/test-chat', name: 'test-chat', component: () => import('../views/TestChatView.vue') },
    { path: '/how-it-works', name: 'how-it-works', component: () => import('../views/HowItWorksView.vue') },
    { path: '/connect', name: 'connect', component: () => import('../views/ConnectView.vue') },
  ],
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();

  if (!auth.ready) {
    await auth.init();
  }

  if (to.meta.public) {
    if (auth.isAuthenticated && to.name === 'login') {
      return { path: loginRedirectTarget(to.query.redirect), replace: true };
    }
    return true;
  }

  if (!auth.isAuthenticated) {
    return { path: '/login', query: { redirect: to.fullPath }, replace: true };
  }

  return true;
});

export default router;
