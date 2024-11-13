import { createApp } from 'vue'
import './style.css'
import App from './app/App.vue'
import router from './app/router';
import pinia from './app/store';

createApp(App)
    .use(router)
    .use(pinia)
    .mount('#app');