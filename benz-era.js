/* Benz Era shared application layer.
   Browser prototype data layer.
   IMPORTANT: for production, replace localStorage with an authenticated server/database.
   Never store real passwords, mobile-money PINs, API keys or payment credentials in localStorage. */

window.BenzEra = (() => {
  const KEY='benz_era_db_v2';
  const LEGACY='benz_era_db_v1';

  const VIPS = {
    vip1:{name:'GLE', price:20000, dailyRate:0.10, validityDays:90},
    vip2:{name:'E-CLASS', price:40000, dailyRate:0.15, validityDays:90},
    vip3:{name:'G-CLASS', price:100000, dailyRate:0.18, validityDays:90},
    vip4:{name:'S-CLASS', price:200000, dailyRate:0.20, validityDays:90}
  };

  const get = () => JSON.parse(localStorage.getItem(KEY) || '{"users":[],"transactions":[],"orders":[],"referrals":[],"profit_logs":[]}');
  const set = db => localStorage.setItem(KEY, JSON.stringify(db));
  const uid = () => 'BE-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,7).toUpperCase();
  const code = () => 'BENZ-'+Math.random().toString(36).slice(2,8).toUpperCase();

  function migrate(){
    let db;
    try { db=get(); } catch(e){ db={users:[],transactions:[],orders:[],referrals:[],profit_logs:[]}; }
    if(!Array.isArray(db.profit_logs)) db.profit_logs=[];
    if(!Array.isArray(db.commission_logs)) db.commission_logs=[];
    if(!Array.isArray(db.orders)) db.orders=[];
    if(!Array.isArray(db.transactions)) db.transactions=[];
    if(!Array.isArray(db.referrals)) db.referrals=[];
    if(!Array.isArray(db.users)) db.users=[];
    set(db);
    return db;
  }

  function current(){
    const id=localStorage.getItem('benz_user_id');
    const db=get();
    return db.users.find(u=>u.id===id)||null;
  }

  function seed(){
    const db=migrate();
    if(!db.users.some(u=>u.username==='admin')){
      db.users.push({
        id:'BE-ADMIN',username:'admin',password:'demo',referral_code:'BENZADMIN',
        referred_by:null,balance:0,created_at:new Date().toISOString(),
        payment:{mobile:null,usdt:null},vips:{}
      });
      set(db);
    }
  }

  function register({username,password,referral_code}){
    const db=get(), ref=String(referral_code||'').trim().toUpperCase();
    if(!username||!password||!ref) throw Error('All required fields must be completed.');
    if(db.users.some(u=>u.username.toLowerCase()===username.toLowerCase())) throw Error('Username already exists.');
    const parent=db.users.find(u=>u.referral_code===ref);
    if(!parent) throw Error('Invalid referral code.');
    const user={
      id:uid(),username,password,referral_code:code(),referred_by:parent.id,
      balance:0,created_at:new Date().toISOString(),
      payment:{mobile:null,usdt:null},vips:{}
    };
    db.users.push(user);
    db.referrals.push({parent_id:parent.id,child_id:user.id,created_at:user.created_at});
    set(db);
    localStorage.setItem('benz_user_id',user.id);
    localStorage.setItem('benz_username',user.username);
    return user;
  }

  function login(username,password){
    const db=get(), u=db.users.find(x=>x.username.toLowerCase()===username.toLowerCase()&&x.password===password);
    if(!u) throw Error('Invalid username or password.');
    localStorage.setItem('benz_user_id',u.id);
    localStorage.setItem('benz_username',u.username);
    applyDailyProfits(u.id);
    return u;
  }

  function savePayment(type,data){
    const u=current(); if(!u) throw Error('Please log in first.');
    const db=get(), row=db.users.find(x=>x.id===u.id);
    row.payment=row.payment||{};
    row.payment[type]=data;
    set(db);
    if(type==='mobile'){
      localStorage.setItem('benz_mobile_number',data.number);
      localStorage.setItem('benz_mobile_name',data.name);
    }
    if(type==='usdt'){
      localStorage.setItem('benz_usdt_address',data.address);
      localStorage.setItem('benz_exchange_name',data.exchange);
      localStorage.setItem('benz_exchange_owner',data.owner);
    }
  }

  function transaction(type,amount,method,status='pending',meta={}){
    const u=current(); if(!u) throw Error('Please log in first.');
    amount=Number(amount);
    if(!(amount>0)) throw Error('Enter a valid amount.');
    const db=get(), row=db.users.find(x=>x.id===u.id);
    if(type==='withdraw' && Number(row.balance||0)<amount) throw Error('Insufficient balance.');
    if(type==='deposit' && status==='successful') row.balance=Number(row.balance||0)+amount;
    if(type==='withdraw' && status==='successful') row.balance=Number(row.balance||0)-amount;
    const tx={id:uid(),user_id:u.id,type,amount,method,status,created_at:new Date().toISOString(),...meta};
    db.transactions.push(tx);
    set(db);
    return {user:row,transaction:tx};
  }

  function confirmDeposit(amount,method,reference){
    return transaction('deposit',amount,method,'successful',{provider_reference:reference||null});
  }

  function creditTeamCommissions(db, buyer, purchaseId, vipId, amount, now){
    const rates=[0.26,0.03,0.01];
    let ancestorId=buyer.referred_by||null;
    rates.forEach((rate,index)=>{
      if(!ancestorId) return;
      const upline=db.users.find(x=>x.id===ancestorId);
      if(!upline) return;
      const level=index+1;
      const commission=Number(amount)*rate;
      upline.balance=Number(upline.balance||0)+commission;
      db.commission_logs.push({
        id:uid(),user_id:upline.id,source_user_id:buyer.id,purchase_id:purchaseId,
        vip_id:vipId,level,rate,amount:commission,created_at:now.toISOString(),status:'successful'
      });
      db.transactions.push({
        id:uid(),user_id:upline.id,type:'team_commission',amount:commission,
        method:'referral',status:'successful',created_at:now.toISOString(),
        source_user_id:buyer.id,purchase_id:purchaseId,vip_id:vipId,level,rate
      });
      ancestorId=upline.referred_by||null;
    });
  }

  function purchaseVIP(id){
    const u=current(); if(!u) throw Error('Please log in first.');
    const vip=VIPS[id]; if(!vip) throw Error('VIP package not found.');
    applyDailyProfits(u.id);
    const db=get(), row=db.users.find(x=>x.id===u.id);
    row.vips=row.vips||{};
    const purchases=Array.isArray(row.vips[id])?row.vips[id]:[];
    if(purchases.length>=3) throw Error('Maximum 3 purchases reached for this VIP.');
    if(Number(row.balance||0)<vip.price){
      throw Error(`Insufficient balance. You need UGX ${vip.price.toLocaleString()} to purchase ${vip.name}.`);
    }
    row.balance=Number(row.balance)-vip.price;
    const now=new Date();
    const expires=new Date(now.getTime()+vip.validityDays*86400000);
    purchases.push({
      id:uid(),package_id:id,name:vip.name,price:vip.price,dailyRate:vip.dailyRate,
      purchased_at:now.toISOString(),expires_at:expires.toISOString(),last_profit_date:null
    });
    row.vips[id]=purchases;
    const purchaseOrderId=uid();
    db.orders.push({
      id:purchaseOrderId,user_id:u.id,type:'vip_purchase',vip_id:id,amount:vip.price,
      status:'successful',created_at:now.toISOString()
    });

    // Credit the buyer's upline automatically when the VIP purchase succeeds.
    // LV1 = 26%, LV2 = 3%, LV3 = 1% of the qualifying VIP purchase amount.
    creditTeamCommissions(db,row,purchaseOrderId,id,vip.price,now);
    set(db);
    return row;
  }

  function localDateKey(d){
    const x=new Date(d);
    const y=x.getFullYear(),m=String(x.getMonth()+1).padStart(2,'0'),day=String(x.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }

  function daysBetween(a,b){
    const A=new Date(a.getFullYear(),a.getMonth(),a.getDate());
    const B=new Date(b.getFullYear(),b.getMonth(),b.getDate());
    return Math.max(0,Math.floor((B-A)/86400000));
  }

  /* Credits one daily profit per active VIP purchase after midnight.
     If the site was closed at midnight, the next visit catches up missed days.
     The rate uses the package's configured dailyRate. */
  function applyDailyProfits(userId){
    const db=get(), row=db.users.find(x=>x.id===userId);
    if(!row) return null;
    row.vips=row.vips||{};
    const today=new Date();
    let changed=false;

    Object.keys(row.vips).forEach(vipId=>{
      const purchases=Array.isArray(row.vips[vipId])?row.vips[vipId]:[];
      purchases.forEach(p=>{
        const purchased=new Date(p.purchased_at);
        const expires=new Date(p.expires_at);
        const end=new Date(Math.min(today.getTime(),expires.getTime()));
        if(end < purchased) return;

        let last=p.last_profit_date ? new Date(p.last_profit_date+'T00:00:00') : new Date(purchased.getFullYear(),purchased.getMonth(),purchased.getDate());
        let start=new Date(last.getFullYear(),last.getMonth(),last.getDate());
        const due=daysBetween(start,end);
        if(due<=0) return;

        const maxDays=vipConfig(vipId).validityDays;
        const alreadyLogged=Number(p.profit_days||0);
        const remaining=Math.max(0,maxDays-alreadyLogged);
        const creditDays=Math.min(due,remaining);
        if(creditDays<=0) return;

        for(let i=1;i<=creditDays;i++){
          const profitDate=new Date(start.getTime()+i*86400000);
          const profit=Number(p.price||0)*Number(p.dailyRate||vipConfig(vipId).dailyRate);
          row.balance=Number(row.balance||0)+profit;
          db.profit_logs.push({
            id:uid(),user_id:row.id,vip_id:vipId,purchase_id:p.id,
            date:localDateKey(profitDate),amount:profit,created_at:new Date().toISOString()
          });
        }
        const finalDate=new Date(start.getTime()+creditDays*86400000);
        p.last_profit_date=localDateKey(finalDate);
        p.profit_days=alreadyLogged+creditDays;
        changed=true;
      });
    });

    if(changed) set(db);
    return row;
  }

  function vipConfig(id){ return VIPS[id] || {name:id,price:0,dailyRate:0,validityDays:90}; }

  function getBalance(){
    const u=current(); if(!u) return 0;
    const fresh=applyDailyProfits(u.id);
    return Number(fresh?.balance||0);
  }

  function getVips(){
    const u=current(); if(!u) return {};
    const fresh=applyDailyProfits(u.id);
    return fresh.vips||{};
  }

  function team(){
    const u=current(); if(!u) return [];
    const db=get(); return db.users.filter(x=>x.referred_by===u.id);
  }


  function getCommissionSummary(){
    const u=current(); if(!u) return {total:0,logs:[]};
    const db=get();
    const logs=(db.commission_logs||[]).filter(x=>x.user_id===u.id);
    return {total:logs.reduce((sum,x)=>sum+Number(x.amount||0),0),logs};
  }

  function logout(){
    localStorage.removeItem('benz_user_id');
    localStorage.removeItem('benz_username');
    location.href='login.html';
  }

  seed();
  return {
    get,set,current,register,login,savePayment,transaction,confirmDeposit,
    purchaseVIP,applyDailyProfits,getBalance,getVips,team,getCommissionSummary,logout,uid,code,VIPS
  };
})();