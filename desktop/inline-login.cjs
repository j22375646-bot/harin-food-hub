'use strict';
const {EventEmitter}=require('node:events');
// A separate sandboxed webContents renders the existing server login form in
// the app window. Passwords never enter the app renderer or an IPC argument.
function createInlineLoginHost({WebContentsView}){
 return class InlineLoginHost extends EventEmitter{
  constructor(options){super();this.parent=options.parent;this.closed=false;this.view=new WebContentsView({webPreferences:options.webPreferences});this.webContents=this.view.webContents;this.resize=()=>{if(this.closed||this.parent.isDestroyed())return;const [width,height]=this.parent.getContentSize();this.view.setBounds({x:0,y:48,width,height:Math.max(1,height-48)});};this.parent.contentView.addChildView(this.view);this.resize();this.parent.on('resize',this.resize);this.onParentClosed=()=>this.destroy();this.parent.once('closed',this.onParentClosed);this.webContents.once('did-finish-load',()=>{if(!this.closed)this.emit('ready-to-show');});}
  isDestroyed(){return this.closed;}
  show(){this.resize();}
  loadURL(url){return this.webContents.loadURL(url);}
  destroy(){if(this.closed)return;this.closed=true;this.parent.removeListener('resize',this.resize);this.parent.removeListener('closed',this.onParentClosed);if(!this.parent.isDestroyed())this.parent.contentView.removeChildView(this.view);if(!this.webContents.isDestroyed())this.webContents.close();this.emit('closed');}
  close(){this.destroy();}
 };
}
module.exports={createInlineLoginHost};
