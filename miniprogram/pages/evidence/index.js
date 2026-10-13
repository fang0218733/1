const api=require('../../services/api');
Page({
 data:{note:'',imagePath:'',busy:false,error:'',backendEnabled:api.backendEnabled},
 onLoad(options){this.id=options.id;},
 note(e){this.setData({note:e.detail.value});},
 choose(){wx.chooseMedia({count:1,mediaType:['image'],sourceType:['album'],success:r=>{const file=r.tempFiles[0];if(file.size>2*1024*1024){this.setData({error:'图片请裁剪或压缩到2MB以内'});return;}this.setData({imagePath:file.tempFilePath,error:''});},fail:()=>{}});},
 clear(){this.setData({imagePath:''});},
 async submit(){if(this.data.busy)return;if(!this.data.note.trim()&&!this.data.imagePath){this.setData({error:'请选择凭证图片或填写核对说明'});return;}this.setData({busy:true,error:''});try{const image=this.data.imagePath?await new Promise((resolve,reject)=>wx.getFileSystemManager().readFile({filePath:this.data.imagePath,encoding:'base64',success:r=>resolve(r.data),fail:()=>reject(new Error('图片读取失败'))})):'';await api.submitEvidence(this.id,{note:this.data.note,image});wx.showModal({title:'凭证已提交',content:this.data.backendEnabled?'已交管理员核对，不代表已付款。请等待实际收款核实。':'仅保存本机模拟凭证，不代表真实收款或后台同步。',showCancel:false,success:()=>wx.navigateBack()});}catch(e){this.setData({error:e.message});}finally{this.setData({busy:false});}}
});
