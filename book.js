import React,{forwardRef,useCallback,useEffect,useImperativeHandle,useRef,useState}from'react';
import{createRoot}from'react-dom/client';
import HTMLFlipBook from'react-pageflip';

import{pages}from'./proposal-data.js';

const Page=forwardRef(function Page({page,index},ref){const r=useRef(null);useImperativeHandle(ref,()=>r.current);return React.createElement('article',{ref:r,className:`book-page ${page.kind}`,'aria-label':page.title},React.createElement('div',{className:'paper-grain','aria-hidden':'true'}),React.createElement('div',{className:'page-content'},page.kicker&&React.createElement('p',{className:'kicker'},page.kicker),React.createElement('div',{dangerouslySetInnerHTML:{__html:page.html}})),!page.kind.includes('cover')&&React.createElement('span',{className:'page-number'},String(index).padStart(2,'0')))});

function playPaperSound(){const A=window.AudioContext||window.webkitAudioContext;if(!A)return;const ctx=new A(),duration=.16,buffer=ctx.createBuffer(1,Math.floor(ctx.sampleRate*duration),ctx.sampleRate),data=buffer.getChannelData(0);let soft=0;for(let i=0;i<data.length;i++){const t=i/data.length;soft=soft*.93+(Math.random()*2-1)*.07;data[i]=soft*Math.sin(Math.PI*t)*(1-t)*.045}const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();filter.type='lowpass';filter.frequency.value=820;gain.gain.value=.12;source.buffer=buffer;source.connect(filter).connect(gain).connect(ctx.destination);source.start();source.onended=()=>ctx.close()}

function App(){const ref=useRef(null);const[current,setCurrent]=useState(0);const[sound,setSound]=useState(false);const[toc,setToc]=useState(false);const[read,setRead]=useState(false);const[textScale,setTextScale]=useState(1);
const go=useCallback(i=>{ref.current?.pageFlip().turnToPage(i);setToc(false)},[]);
useEffect(()=>{const click=e=>{const b=e.target.closest('[data-go]');if(b){e.preventDefault();go(Number(b.dataset.go))}};document.addEventListener('click',click);return()=>document.removeEventListener('click',click)},[go]);
useEffect(()=>{const key=e=>{if(e.key==='Escape'){setToc(false);setRead(false)}if(!read&&e.key==='ArrowRight')ref.current?.pageFlip().flipNext();if(!read&&e.key==='ArrowLeft')ref.current?.pageFlip().flipPrev()};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[read]);
const onFlip=e=>{setCurrent(e.data);if(sound)playPaperSound()};
const exportBody=()=>pages.filter(p=>!p.kind.includes('cover')).map(p=>`<section><p class="kicker">${p.kicker||''}</p><h1>${p.title}</h1>${p.html}</section>`).join('');
const cleanText=html=>{const d=new DOMParser().parseFromString(html,'text/html');return(d.body.innerText||d.body.textContent||'').replace(/\\n{3,}/g,'\\n\\n').trim()};
const proposalSections=()=>pages.filter(p=>!p.kind.includes('cover')).map(p=>({title:p.title,kicker:p.kicker||'',text:cleanText(p.html)}));

const downloadPDF=async()=>{try{
  const mod=await import('https://esm.sh/jspdf@3.0.3');
  const jsPDF=mod.jsPDF||mod.default?.jsPDF||mod.default;
  const doc=new jsPDF({orientation:'portrait',unit:'pt',format:'letter',compress:true});
  const margin=54,pageW=612,pageH=792,maxW=pageW-margin*2;
  let y=60,first=true;
  const addPage=()=>{if(!first)doc.addPage();first=false;y=60};
  const writeLines=(txt,size=11,leading=16,bold=false)=>{doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);const lines=doc.splitTextToSize(txt,maxW);for(const line of lines){if(y>pageH-58){doc.addPage();y=60}doc.text(line,margin,y);y+=leading}};
  for(const s of proposalSections()){
    if(!first)doc.addPage();first=false;y=60;
    if(s.kicker){doc.setTextColor(105);writeLines(s.kicker.toUpperCase(),9,13,true);doc.setTextColor(30);y+=4}
    writeLines(s.title,22,27,true);y+=8;
    for(const para of s.text.split(/\\n+/).map(x=>x.trim()).filter(Boolean)){writeLines(para,11,16,false);y+=7}
  }
  doc.save('Crown_Core_90_Day_Proposal.pdf');
}catch(err){console.error(err);alert('PDF download could not be created. Please try again.')}};

const downloadWord=async()=>{try{
  const d=await import('https://esm.sh/docx@9.5.1');
  const {Document,Packer,Paragraph,TextRun,HeadingLevel}=d;
  const children=[];
  for(const s of proposalSections()){
    if(s.kicker)children.push(new Paragraph({children:[new TextRun({text:s.kicker.toUpperCase(),bold:true,size:18,color:'777777'})],spacing:{before:180,after:80}}));
    children.push(new Paragraph({text:s.title,heading:HeadingLevel.HEADING_1,spacing:{before:120,after:180}}));
    for(const para of s.text.split(/\\n+/).map(x=>x.trim()).filter(Boolean)){
      children.push(new Paragraph({children:[new TextRun({text:para,size:22})],spacing:{after:120,line:300}}));
    }
  }
  const doc=new Document({creator:'MACS Digital Media',title:'Crown & Core - 90-Day Proposal',sections:[{properties:{},children}]});
  const blob=await Packer.toBlob(doc);
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='Crown_Core_90_Day_Proposal.docx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}catch(err){console.error(err);alert('Word download could not be created. Please try again.')}};
const readPage=pages[current];
return React.createElement('main',{className:'reading-room'},
React.createElement('div',{className:'ambient-light','aria-hidden':'true'}),
React.createElement('header',{className:'reader-bar'},React.createElement('button',{className:'wordmark',onClick:()=>go(0)},'CROWN & CORE'),React.createElement('div',{className:'reader-actions'},React.createElement('button',{onClick:()=>setToc(v=>!v),'aria-expanded':toc},'Contents'),React.createElement('button',{onClick:()=>setRead(true)},'Read'),React.createElement('button',{onClick:()=>setSound(v=>!v),'aria-pressed':sound},sound?'Sound On':'Sound Off'))),
React.createElement('section',{className:'book-stage','aria-label':'Interactive proposal'},React.createElement('button',{className:'side-turn side-turn-prev',onClick:()=>ref.current?.pageFlip().flipPrev(),disabled:current===0,'aria-label':'Previous page'},'‹'),React.createElement(HTMLFlipBook,{ref,width:620,height:820,size:'stretch',minWidth:300,maxWidth:700,minHeight:420,maxHeight:930,showCover:true,usePortrait:true,drawShadow:true,flippingTime:650,maxShadowOpacity:.24,mobileScrollSupport:true,clickEventForward:true,useMouseEvents:true,swipeDistance:22,showPageCorners:true,disableFlipByClick:false,className:'flip-book',onFlip},pages.map((p,i)=>React.createElement(Page,{key:i,page:p,index:i}))),React.createElement('button',{className:'side-turn side-turn-next',onClick:()=>ref.current?.pageFlip().flipNext(),disabled:current>=pages.length-1,'aria-label':'Next page'},'›')),
React.createElement('footer',{className:'reader-footer'},React.createElement('span',null,`${current+1} / ${pages.length}`),React.createElement('div',{className:'download-links'},React.createElement('button',{onClick:downloadPDF},'PDF'),React.createElement('button',{onClick:downloadWord},'Word'))),
toc&&React.createElement('aside',{className:'toc-drawer','aria-label':'Contents'},React.createElement('div',{className:'drawer-heading'},React.createElement('strong',null,'Contents'),React.createElement('button',{onClick:()=>setToc(false),'aria-label':'Close contents'},'×')),['The 90-Day Plan','Google & Local Search','Brand Voice, Content & Social','Systems, Automation & Data','Main Offers','Video Production','Assets Crown & Core Keeps','What Happens Each Month','What We Need From You','What We Will Not Do','What Success Looks Like','MAXX Circle™','Investment','Our Delivery Guarantee','Ownership','If You’re Not Against Moving Forward','Agreement Parties'].map(name=>{const i=pages.findIndex(p=>p.title===name);return React.createElement('button',{key:name,onClick:()=>go(i)},React.createElement('span',null,String(i).padStart(2,'0')),React.createElement('b',null,name))})),
read&&React.createElement('div',{className:'read-modal',role:'dialog','aria-modal':'true','aria-label':`Read ${readPage.title}`},React.createElement('div',{className:'read-panel',style:{'--text-scale':textScale}},React.createElement('div',{className:'read-toolbar'},React.createElement('button',{onClick:()=>setTextScale(v=>Math.max(.95,+(v-.1).toFixed(2))),'aria-label':'Decrease text size'},'A−'),React.createElement('button',{onClick:()=>setTextScale(v=>Math.min(1.5,+(v+.1).toFixed(2))),'aria-label':'Increase text size'},'A+'),React.createElement('button',{onClick:()=>setRead(false),'aria-label':'Close reading mode'},'Close')),React.createElement('p',{className:'kicker'},readPage.kicker||readPage.title),React.createElement('h2',{className:'read-title'},readPage.title),React.createElement('div',{className:'read-copy',dangerouslySetInnerHTML:{__html:readPage.html}}),React.createElement('div',{className:'read-nav'},React.createElement('button',{disabled:current===0,onClick:()=>{go(Math.max(0,current-1));setRead(false)}},'Previous'),React.createElement('button',{disabled:current>=pages.length-1,onClick:()=>{go(Math.min(pages.length-1,current+1));setRead(false)}},'Next')))));
}

createRoot(document.getElementById('root')).render(React.createElement(App));
