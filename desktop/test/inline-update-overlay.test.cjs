'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events');
test('update prompt temporarily covers inline login and restores it without closing its session',()=>{
 class View{constructor(){this.webContents=new EventEmitter();this.webContents.isDestroyed=()=>false;this.webContents.close=()=>{};}setVisible(v){this.visible=v;}setBounds(){}}
 const Parent=new EventEmitter();Object.assign(Parent,{isDestroyed:()=>false,getContentSize:()=>[1000,800],contentView:{addChildView(){},removeChildView(){}}});
 const Host=require('../inline-login.cjs').createInlineLoginHost({WebContentsView:View});const host=new Host({parent:Parent,webPreferences:{}});host.show();assert.equal(host.view.visible,true);Host.setObscured(true);assert.equal(host.view.visible,false);host.show();assert.equal(host.view.visible,false);Host.setObscured(false);assert.equal(host.view.visible,true);assert.equal(host.isDestroyed(),false);host.destroy();Host.setObscured(true);
});
