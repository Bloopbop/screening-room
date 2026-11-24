import { mount } from 'svelte';
import { registerSW } from 'virtual:pwa-register';
import App from './App.svelte';
import './app.css';

// Installs the offline shell and keeps it up to date.
registerSW({ immediate: true });

const target = document.getElementById('app');
if (!target) throw new Error('Missing #app element');

mount(App, { target });
