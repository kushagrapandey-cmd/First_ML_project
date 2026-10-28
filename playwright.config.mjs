import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/browser',fullyParallel:false,workers:1,retries:0,
 use:{baseURL:'http://127.0.0.1:3000',trace:'retain-on-failure'},
 projects:[
  {name:'desktop',use:{browserName:'chromium',viewport:{width:1280,height:800}}},
  {name:'phone',use:{browserName:'chromium',viewport:{width:390,height:844},isMobile:true,hasTouch:true}}
 ],
 webServer:{command:'python3 scripts/dev.py',url:'http://127.0.0.1:3000',reuseExistingServer:false,timeout:30000}
});
