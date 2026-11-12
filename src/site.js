(function(){
  'use strict';
  var doc=document, root=doc.documentElement;
  var reduce=window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function $(s,c){return (c||doc).querySelector(s)}
  function $$(s,c){return Array.prototype.slice.call((c||doc).querySelectorAll(s))}
  function setHash(h){try{history.replaceState(null,'',h?('#'+h):(location.pathname+location.search))}catch(e){}}

  /* ---------- project filters ---------- */
  var chips=$$('.chip'), cards=$$('[data-tags]'), countEl=$('#work-count');
  function applyFilter(f){
    var n=0;
    cards.forEach(function(c){var show=f==='all'||c.getAttribute('data-tags').split(' ').indexOf(f)>-1;c.hidden=!show;if(show)n++});
    chips.forEach(function(ch){ch.setAttribute('aria-pressed',String(ch.getAttribute('data-filter')===f))});
    countEl.textContent=n===1?'Showing 1 project':'Showing '+n+' projects';
    $('#work-empty').hidden=n>0;
  }
  chips.forEach(function(ch){ch.addEventListener('click',function(){applyFilter(ch.getAttribute('data-filter'))})});

  /* ---------- case-study dialog ---------- */
  var caseDlg=$('#case'), caseMount=$('#case-mount'), order=$$('.case-src').map(function(a){return a.id});
  var current=null, lastFocus=null;
  function openCase(id,push){
    var src=doc.getElementById(id); if(!src||!src.classList.contains('case-src')) return false;
    current=id;
    caseMount.innerHTML='';
    var node=src.cloneNode(true); node.removeAttribute('id'); node.hidden=false; node.classList.remove('case-src'); caseMount.appendChild(node);
    var i=order.indexOf(id);
    $('#case-pos').textContent='Project '+String(i+1).padStart(2,'0')+' / '+String(order.length).padStart(2,'0');
    var prev=order[(i-1+order.length)%order.length], next=order[(i+1)%order.length];
    $('#case-prev').setAttribute('data-go',prev); $('#case-next').setAttribute('data-go',next);
    $$('[data-go-label="prev"]',caseMount).forEach(function(b){b.setAttribute('data-go',prev);b.querySelector('span').textContent=titleOf(prev)});
    $$('[data-go-label="next"]',caseMount).forEach(function(b){b.setAttribute('data-go',next);b.querySelector('span').textContent=titleOf(next)});
    wireFigures();
    if(!caseDlg.open){lastFocus=doc.activeElement;if(caseDlg.showModal)caseDlg.showModal();else caseDlg.setAttribute('open','');root.style.overflow='hidden'}
    caseDlg.scrollTop=0;
    var h=$('h2',caseMount); if(h){h.setAttribute('tabindex','-1');h.focus({preventScroll:true})}
    if(push!==false) setHash(id);
    return true;
  }
  function titleOf(id){var s=doc.getElementById(id);return s?s.getAttribute('data-title'):''}
  function closeCase(){
    if(caseDlg.open){if(caseDlg.close)caseDlg.close();else caseDlg.removeAttribute('open')}
  }
  caseDlg.addEventListener('close',function(){root.style.overflow='';current=null;setHash('');if(lastFocus&&lastFocus.focus)lastFocus.focus()});
  caseDlg.addEventListener('click',function(e){
    var go=e.target.closest('[data-go]'); if(go){e.preventDefault();openCase(go.getAttribute('data-go'));return}
    if(e.target.closest('[data-close]')){e.preventDefault();closeCase()}
  });
  $$('[data-case]').forEach(function(a){a.addEventListener('click',function(e){
    if(e.metaKey||e.ctrlKey||e.shiftKey) return;
    if(openCase(a.getAttribute('data-case'))) e.preventDefault();
  })});
  function fromHash(){var h=(location.hash||'').slice(1); if(h&&order.indexOf(h)>-1) openCase(h,false)}
  window.__openCase=openCase;
  window.addEventListener('hashchange',fromHash);
  fromHash();

  /* ---------- lightbox with zoom + pan ---------- */
  var lb=$('#lightbox'), stage=$('#lb-stage'), lbImg=$('#lb-img'), lbCap=$('#lb-cap'), lbCount=$('#lb-count');
  var figs=[], lbTitle='', fi=0, scale=1, tx=0, ty=0, pointers={}, startDist=0, startScale=1, last=null;
  function wireFigures(){
    var list=$$('.fig button',caseMount);
    list.forEach(function(b,i){
      b.addEventListener('click',function(){figs=list;lbTitle=titleOf(current);openLb(i)});
      var im=b.querySelector('img');
      if(i<4){im.loading='eager'; if(i<2) im.setAttribute('fetchpriority','high')}
      trackImg(im,b);
    });
  }
  /* loading state: the placeholder shows until the map arrives; failed loads get a retry */
  function trackImg(im,box){
    function ok(){box.classList.add('is-loaded');box.classList.remove('is-error')}
    function bad(){box.classList.add('is-error')}
    if(im.complete&&im.naturalWidth){ok();return}
    im.addEventListener('load',ok); im.addEventListener('error',bad);
    box.addEventListener('click',function(e){
      if(!box.classList.contains('is-error'))return;
      e.preventDefault(); e.stopImmediatePropagation();
      box.classList.remove('is-error'); var u=im.getAttribute('src'); im.removeAttribute('src'); im.setAttribute('src',u);
    },true);
  }
  /* map plates inside the journey chapters open the same viewer */
  $$('.plate').forEach(function(pl){
    var list=$$('.fig button',pl);
    list.forEach(function(b,i){
      b.addEventListener('click',function(){figs=list;lbTitle=pl.getAttribute('data-title')||'';openLb(i)});
      trackImg(b.querySelector('img'),b);
    });
  });
  $$('.card .thumb').forEach(function(t){var im=t.querySelector('img'); if(im) trackImg(im,t)});
  function apply(){lbImg.style.transform='translate('+tx+'px,'+ty+'px) scale('+scale+')';$('#lb-out').disabled=scale<=1;$('#lb-reset').disabled=scale===1&&tx===0&&ty===0}
  function reset(){scale=1;tx=0;ty=0;apply()}
  function zoom(f,cx,cy){
    var ns=Math.min(6,Math.max(1,scale*f)); if(ns===scale)return;
    var r=stage.getBoundingClientRect(); cx=(cx==null?r.left+r.width/2:cx)-(r.left+r.width/2); cy=(cy==null?r.top+r.height/2:cy)-(r.top+r.height/2);
    tx=cx-(cx-tx)*(ns/scale); ty=cy-(cy-ty)*(ns/scale); scale=ns; if(scale===1){tx=0;ty=0} apply();
  }
  function show(i){
    fi=(i+figs.length)%figs.length; var b=figs[fi], im=b.querySelector('img');
    /* show the thumbnail at once, then swap in the full-resolution map when it arrives */
    var full=b.getAttribute('data-full'), want=fi;
    lbImg.src=b.getAttribute('data-thumb'); lbImg.alt=im.alt;
    lbImg.width=+b.getAttribute('data-w'); lbImg.height=+b.getAttribute('data-h');
    var ld=$('#lb-loading'); ld.hidden=false;
    var pre=new Image(); pre.decoding='async';
    pre.onload=function(){if(fi===want){lbImg.src=full;ld.hidden=true}};
    pre.onerror=function(){if(fi===want){ld.textContent='Full resolution unavailable · showing preview'}};
    ld.textContent='Loading full resolution…'; pre.src=full;
    lbCap.innerHTML=''; var l=doc.createElement('span'); l.className='label'; l.textContent=lbTitle; lbCap.appendChild(l); lbCap.appendChild(doc.createTextNode(b.parentNode.querySelector('figcaption').textContent));
    lbCount.textContent=(fi+1)+' / '+figs.length;
    $('#lb-prev').disabled=$('#lb-next').disabled=figs.length<2;
    reset();
  }
  function openLb(i){show(i); if(lb.showModal)lb.showModal();else lb.setAttribute('open',''); $('#lb-close').focus()}
  function closeLb(){if(lb.open){if(lb.close)lb.close();else lb.removeAttribute('open')} var b=figs[fi]; if(b)b.focus()}
  $('#lb-in').addEventListener('click',function(){zoom(1.5)});
  $('#lb-out').addEventListener('click',function(){zoom(1/1.5)});
  $('#lb-reset').addEventListener('click',reset);
  $('#lb-prev').addEventListener('click',function(){show(fi-1)});
  $('#lb-next').addEventListener('click',function(){show(fi+1)});
  $('#lb-close').addEventListener('click',closeLb);
  lb.addEventListener('cancel',function(e){e.preventDefault();closeLb()});
  lb.addEventListener('keydown',function(e){
    if(e.key==='ArrowRight'){show(fi+1)} else if(e.key==='ArrowLeft'){show(fi-1)}
    else if(e.key==='+'||e.key==='='){zoom(1.5)} else if(e.key==='-'){zoom(1/1.5)} else if(e.key==='0'){reset()}
  });
  stage.addEventListener('wheel',function(e){e.preventDefault();zoom(e.deltaY<0?1.2:1/1.2,e.clientX,e.clientY)},{passive:false});
  stage.addEventListener('dblclick',function(e){if(scale>1)reset();else zoom(2.5,e.clientX,e.clientY)});
  stage.addEventListener('pointerdown',function(e){
    stage.setPointerCapture(e.pointerId); pointers[e.pointerId]={x:e.clientX,y:e.clientY};
    var ids=Object.keys(pointers);
    if(ids.length===2){var a=pointers[ids[0]],b=pointers[ids[1]];startDist=Math.hypot(a.x-b.x,a.y-b.y);startScale=scale}
    last={x:e.clientX,y:e.clientY}; stage.classList.add('is-dragging');
  });
  stage.addEventListener('pointermove',function(e){
    if(!pointers[e.pointerId])return; pointers[e.pointerId]={x:e.clientX,y:e.clientY};
    var ids=Object.keys(pointers);
    if(ids.length===2&&startDist){var a=pointers[ids[0]],b=pointers[ids[1]];var d=Math.hypot(a.x-b.x,a.y-b.y);var target=Math.min(6,Math.max(1,startScale*d/startDist));zoom(target/scale,(a.x+b.x)/2,(a.y+b.y)/2);return}
    if(scale>1&&last){tx+=e.clientX-last.x;ty+=e.clientY-last.y;apply()}
    last={x:e.clientX,y:e.clientY};
  });
  function up(e){delete pointers[e.pointerId]; if(Object.keys(pointers).length<2)startDist=0; if(!Object.keys(pointers).length){stage.classList.remove('is-dragging');last=null}}
  stage.addEventListener('pointerup',up); stage.addEventListener('pointercancel',up);

  /* ---------- email (assembled here so plain-text scrapers miss it) ---------- */
  var addr=['dhananjaysmadaik','gmail.com'].join('@');
  /* "request by email" buttons for reports shared on request */
  $$('[data-request]').forEach(function(a){
    a.href='mailto:'+addr+'?subject='+encodeURIComponent('Request: '+a.getAttribute('data-request'))+'&body='+encodeURIComponent('Hello Dhananjay,\n\nCould you share the '+a.getAttribute('data-request')+'?\n\nThank you,\n');
  });
  $$('[data-mail]').forEach(function(el){
    if(el.tagName==='A'){el.href='mailto:'+addr} else {el.textContent=addr}
  });
  var copyBtn=$('#copy-mail');
  if(copyBtn){copyBtn.addEventListener('click',function(){
    function done(t){copyBtn.textContent=t;setTimeout(function(){copyBtn.textContent='Copy'},1800)}
    function fallback(){var el=$('#mail-text'),r=doc.createRange();r.selectNodeContents(el);var s=getSelection();s.removeAllRanges();s.addRange(r);done('Selected')}
    if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(addr).then(function(){done('Copied')},fallback)}else fallback();
  })}
  var yr=$('#year'); if(yr) yr.textContent=String(new Date().getFullYear());

})();
