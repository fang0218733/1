const api = require('../../services/api');
Page({
  data: { freeCards: [], categories: [], perspective:'',relationship:'', relationships:['BG','GL','BL'],search: '', category: '', sort: 'new', favorites: false, page: 0, hasMore: false, loading: false, backendEnabled: api.backendEnabled, activeCard: null, error: '' },
  onShow() { this.loadCards(); },
  onUnload() { clearTimeout(this.searchTimer); },
  onReachBottom() { if(this.data.hasMore&&!this.data.loading)this.loadCards(true); },
  loadCards(append=false) {
    const version=(this.version||0)+1;this.version=version;const page=append?this.data.page+1:0;
    this.setData({loading:true,error:''});
    api.getCards({perspective:this.data.perspective,relationship:this.data.relationship,search:this.data.search,category:this.data.category,sort:this.data.sort,favorites:this.data.favorites,page}).then(result=>{if(this.version!==version)return;this.setData({freeCards:append?this.data.freeCards.concat(result.items):result.items,categories:result.categories,hasMore:result.hasMore,page});}).catch(e=>{if(this.version===version)this.setData({error:e.message});}).finally(()=>{if(this.version===version)this.setData({loading:false});});
  },
  search(e) { this.setData({search:e.detail.value});clearTimeout(this.searchTimer);this.searchTimer=setTimeout(()=>this.loadCards(),300); },
  relationship(e) { this.setData({relationship:e.currentTarget.dataset.value});this.loadCards(); },
  perspective(e) {this.setData({perspective:e.currentTarget.dataset.value,activeCard:null});this.loadCards();},
  category(e) { this.setData({category:e.currentTarget.dataset.category});this.loadCards(); },
  sort(e) { this.setData({sort:e.currentTarget.dataset.sort});this.loadCards(); },
  favorites() { this.setData({favorites:!this.data.favorites});this.loadCards(); },
  favorite(e) { const card=this.data.freeCards.find(c=>c.id===e.currentTarget.dataset.id);if(!card)return;api.favoriteCard(card.id,!card.favorite).then(()=>this.loadCards()).catch(err=>this.setData({error:err.message})); },
  viewCard(e) { this.setData({ activeCard: this.data.freeCards.find(c => c.id === e.currentTarget.dataset.id) }); },
  closeCard() { this.setData({ activeCard: null }); },
  copyCard() { if (!this.data.activeCard) return;const id=this.data.activeCard.id;wx.setClipboardData({data:this.data.activeCard.card,success:()=>{api.downloadCard(id).then(()=>this.loadCards()).catch(e=>this.setData({error:'已复制，但下载统计失败：'+e.message}));},fail:()=>wx.showToast({title:'复制失败，请重试',icon:'none'})}); },
  download() { if(!this.data.activeCard)return;const card=this.data.activeCard;const file=wx.env.USER_DATA_PATH+'/persona-'+card.id+'.txt';wx.getFileSystemManager().writeFile({filePath:file,data:card.card,encoding:'utf8',success:()=>{api.downloadCard(card.id).then(()=>{this.loadCards();wx.showModal({title:'人设文件已保存',content:'已保存到小程序文件空间，可导出到微信会话。',confirmText:'导出文件',success:r=>{if(r.confirm&&wx.shareFileMessage)wx.shareFileMessage({filePath:file,fileName:card.name+'.txt',fail:()=>wx.showToast({title:'导出取消或失败，可使用复制',icon:'none'})});}});}).catch(e=>this.setData({error:e.message}));},fail:()=>wx.showToast({title:'保存失败，请重试',icon:'none'})}); },
});
