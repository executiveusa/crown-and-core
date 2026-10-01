import React,{forwardRef,useCallback,useEffect,useImperativeHandle,useRef,useState}from'react';
import{createRoot}from'react-dom/client';
import HTMLFlipBook from'react-pageflip';
import{pages}from'./proposal-data.js';
import{loadAgreement,agreementHash}from'./agreement-data.js';

const Page=forwardRef(function Page({page,index},ref){
  const r=useRef(null);
  useImperativeHandle(ref,()=>r.current);
  return React.createElement('article',{ref:r,className:`book-page ${page.kind}`,'aria-label':page.title},
    React.createElement('div',{className:'paper-grain','aria-hidden':'true'}),
    React.createElement('div',{className:'page-content'},
      page.kicker&&React.createElement('p',{className:'kicker'},page.kicker),
      React.createElement('div',{dangerouslySetInnerHTML:{__html:page.html}})
    ),
    !page.kind.includes('cover')&&React.createElement('span',{className:'page-number'},String(index).padStart(2,'0'))
  )
});

function playPaperSound(){const A=window.AudioContext||window.webkitAudioContext;if(!A)return;const ctx=new A(),duration=.16,buffer=ctx.createBuffer(1,Math.floor(ctx.sampleRate*duration),ctx.sampleRate),data=buffer.getChannelData(0);let soft=0;for(let i=0;i<data.length;i++){const t=i/data.length;soft=soft*.93+(Math.random()*2-1)*.07;data[i]=soft*Math.sin(Math.PI*t)*(1-t)*.045}const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();filter.type='lowpass';filter.frequency.value=820;gain.gain.value=.12;source.buffer=buffer;source.connect(filter).connect(gain).connect(ctx.destination);source.start();source.onended=()=>ctx.close()}

function App(){const ref=useRef(null);const[current,setCurrent]=useState(0);const[sound,setSound]=useState(false);const[toc,setToc]=useState(false);const[agreementOpen,setAgreementOpen]=useState(false);const[agreementData,setAgreementData]=useState(null);const[agreementLoading,setAgreementLoading]=useState(false);const[textScale,setTextScale]=useState(1);
const go=useCallback(i=>{ref.current?.pageFlip().turnToPage(i);setToc(false)},[]);
useEffect(()=>{const click=e=>{const b=e.target.closest('[data-go]');if(b){e.preventDefault();go(Number(b.dataset.go))}};document.addEventListener('click',click);return()=>document.removeEventListener('click',click)},[go]);
useEffect(()=>{const key=e=>{if(e.key==='Escape'){setToc(false);setAgreementOpen(false)}if(!agreementOpen&&e.key==='ArrowRight')ref.current?.pageFlip().flipNext();if(!agreementOpen&&e.key==='ArrowLeft')ref.current?.pageFlip().flipPrev()};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key)},[agreementOpen]);
const onFlip=e=>{setCurrent(e.data);if(sound)playPaperSound()};

const getAgreement=async()=>{
  if(agreementData)return agreementData;
  setAgreementLoading(true);
  try{
    const data=await loadAgreement();
    setAgreementData(data);
    return data;
  }finally{setAgreementLoading(false)}
};
const openAgreement=async()=>{setAgreementOpen(true);await getAgreement()};

const blockText=b=>b.type==='p'?b.text:(b.rows||[]).flat().join('\n');
const agreementBlocks=async()=>{const data=await getAgreement();return data.blocks||[]};

const downloadPDF=async()=>{try{
  const [mod,blocks]=await Promise.all([import('https://esm.sh/jspdf@3.0.3'),agreementBlocks()]);
  const jsPDF=mod.jsPDF||mod.default?.jsPDF||mod.default;
  const doc=new jsPDF({orientation:'portrait',unit:'pt',format:'letter',compress:true});
  const margin=54,pageW=612,pageH=792,maxW=pageW-margin*2;
  let y=58,first=true;
  const ensure=(need=28)=>{if(y>pageH-need){doc.addPage();y=58}};
  const write=(txt,size=11,leading=17,bold=false,spaceAfter=7)=>{
    doc.setFont('helvetica',bold?'bold':'normal');doc.setFontSize(size);
    const lines=doc.splitTextToSize(txt,maxW);
    for(const line of lines){ensure(leading+54);doc.text(line,margin,y);y+=leading}
    y+=spaceAfter;
  };
  for(const b of blocks){
    if(b.type==='table'){
      const cells=(b.rows||[]).flat().filter(Boolean);
      for(const cell of cells){ensure(54);doc.setFillColor(246,242,235);const lines=doc.splitTextToSize(cell,maxW-24);const h=Math.max(42,lines.length*16+18);if(y+h>pageH-48){doc.addPage();y=58}doc.roundedRect(margin,y-12,maxW,h,3,3,'F');doc.setTextColor(45);doc.setFont('helvetica','normal');doc.setFontSize(11);let ty=y+7;for(const line of lines){doc.text(line,margin+12,ty);ty+=16}y+=h+10}
      continue;
    }
    const style=b.style||'Normal',txt=b.text||'';
    if(!txt)continue;
    if(style==='Title'){if(!first){doc.addPage();y=58}first=false;write(txt,28,32,true,14)}
    else if(style==='Heading 1'){ensure(64);y+=10;write(txt,21,25,true,10)}
    else if(style==='Heading 2'){ensure(48);write(txt,14,19,true,6)}
    else if(style==='List Bullet'){write('• '+txt,11,17,false,3)}
    else write(txt,11,17,false,7);
  }
  doc.setProperties({title:'Crown & Core - 90-Day Agreement - Final Revision 01',subject:'Ready-to-sign agreement; canonical digital source '+agreementHash});
  doc.save('Crown_Core_90_Day_Agreement_FINAL_REVISION_01_READY_TO_SIGN.pdf');
}catch(err){console.error(err);alert('PDF download could not be created. Please try again.')}};

const downloadWord=async()=>{try{
  const [d,blocks]=await Promise.all([import('https://esm.sh/docx@9.5.1'),agreementBlocks()]);
  const {Document,Packer,Paragraph,TextRun,HeadingLevel}=d;
  const children=[];
  for(const b of blocks){
    if(b.type==='table'){
      for(const cell of (b.rows||[]).flat().filter(Boolean)){
        children.push(new Paragraph({children:[new TextRun({text:cell,size:24})],spacing:{before:100,after:160,line:360}}));
      }
      continue;
    }
    const style=b.style||'Normal',txt=b.text||'';
    if(!txt)continue;
    if(style==='Title')children.push(new Paragraph({text:txt,heading:HeadingLevel.TITLE,spacing:{before:120,after:220}}));
    else if(style==='Heading 1')children.push(new Paragraph({text:txt,heading:HeadingLevel.HEADING_1,spacing:{before:260,after:120}}));
    else if(style==='Heading 2')children.push(new Paragraph({text:txt,heading:HeadingLevel.HEADING_2,spacing:{before:160,after:80}}));
    else if(style==='List Bullet')children.push(new Paragraph({children:[new TextRun({text:'• '+txt,size:24})],spacing:{after:80,line:360}}));
    else children.push(new Paragraph({children:[new TextRun({text:txt,size:24})],spacing:{after:140,line:360}}));
  }
  const doc=new Document({creator:'MACS Digital Media',title:'Crown & Core - 90-Day Agreement - Final Revision 01',description:'Canonical source hash: '+agreementHash,sections:[{properties:{},children}]});
  const blob=await Packer.toBlob(doc);
  const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='Crown_Core_90_Day_Agreement_FINAL_REVISION_01_READY_TO_SIGN.docx';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}catch(err){console.error(err);alert('Word download could not be created. Please try again.')}};

const AgreementBlock=({block,index})=>{
  if(block.type==='table'){
    const cells=(block.rows||[]).flat().filter(Boolean);
    return React.createElement('div',{className:cells.length>1?'agreement-table agreement-signatures':'agreement-callout',key:index},
      cells.map((cell,i)=>React.createElement('div',{key:i,className:'agreement-cell'},cell.split('\n').map((line,j)=>React.createElement('p',{key:j},line))))
    );
  }
  const style=block.style||'Normal';
  if(style==='Title')return React.createElement('h1',{className:'agreement-title',key:index},block.text);
  if(style==='Heading 1')return React.createElement('h2',{className:'agreement-h1',key:index},block.text);
  if(style==='Heading 2')return React.createElement('h3',{className:'agreement-h2',key:index},block.text);
  if(style==='List Bullet')return React.createElement('p',{className:'agreement-bullet',key:index},block.text);
  return React.createElement('p',{className:'agreement-paragraph',key:index},block.text);
};

return React.createElement('main',{className:'reading-room'},
React.createElement('div',{className:'ambient-light','aria-hidden':'true'}),
React.createElement('header',{className:'reader-bar'},React.createElement('button',{className:'wordmark',onClick:()=>go(0)},'CROWN & CORE'),React.createElement('div',{className:'reader-actions'},React.createElement('button',{onClick:()=>setToc(v=>!v),'aria-expanded':toc},'Contents'),React.createElement('button',{className:'agreement-open-button',onClick:openAgreement},'Full Agreement'),React.createElement('span',{className:'mobile-read-label'},'Best on phone'),React.createElement('button',{onClick:()=>setSound(v=>!v),'aria-pressed':sound},sound?'Sound On':'Sound Off'))),
React.createElement('section',{className:'book-stage','aria-label':'Interactive agreement overview'},React.createElement('button',{className:'side-turn side-turn-prev',onClick:()=>ref.current?.pageFlip().flipPrev(),disabled:current===0,'aria-label':'Previous page'},'‹'),React.createElement(HTMLFlipBook,{ref,width:620,height:820,size:'stretch',minWidth:300,maxWidth:700,minHeight:420,maxHeight:930,showCover:true,usePortrait:true,drawShadow:true,flippingTime:650,maxShadowOpacity:.24,mobileScrollSupport:true,clickEventForward:true,useMouseEvents:true,swipeDistance:22,showPageCorners:true,disableFlipByClick:false,className:'flip-book',onFlip},pages.map((p,i)=>React.createElement(Page,{key:i,page:p,index:i}))),React.createElement('button',{className:'side-turn side-turn-next',onClick:()=>ref.current?.pageFlip().flipNext(),disabled:current>=pages.length-1,'aria-label':'Next page'},'›')),
React.createElement('footer',{className:'reader-footer'},React.createElement('span',null,`Overview ${current+1} / ${pages.length}`),React.createElement('div',{className:'download-links'},React.createElement('button',{onClick:openAgreement},'Read Agreement'),React.createElement('button',{onClick:downloadPDF},'PDF'),React.createElement('button',{onClick:downloadWord},'Word'))),
toc&&React.createElement('aside',{className:'toc-drawer','aria-label':'Contents'},React.createElement('div',{className:'drawer-heading'},React.createElement('strong',null,'Contents'),React.createElement('button',{onClick:()=>setToc(false),'aria-label':'Close contents'},'×')),['The 90-Day Plan','Google & Local Search','Brand Voice, Content & Social','Systems, Automation & Data','Main Offers','Video Production','Assets Crown & Core Keeps','What Happens Each Month','What We Need From You','What We Will Not Do','What Success Looks Like','MAXX Circle™','Investment','Our Delivery Guarantee','Ownership','If You’re Not Against Moving Forward','Agreement Parties'].map(name=>{const i=pages.findIndex(p=>p.title===name);return React.createElement('button',{key:name,onClick:()=>go(i)},React.createElement('span',null,String(i).padStart(2,'0')),React.createElement('b',null,name))})),
agreementOpen&&React.createElement('div',{className:'read-modal agreement-modal',role:'dialog','aria-modal':'true','aria-label':'Full Crown & Core agreement'},
  React.createElement('div',{className:'read-panel agreement-panel',style:{'--text-scale':textScale}},
    React.createElement('div',{className:'read-toolbar'},
      React.createElement('div',{className:'agreement-toolbar-title'},React.createElement('strong',null,'Final Agreement · Revision 01'),React.createElement('span',null,'October 1, 2026')),
      React.createElement('div',{className:'agreement-toolbar-actions'},
        React.createElement('button',{onClick:()=>setTextScale(v=>Math.max(.95,+(v-.1).toFixed(2))),'aria-label':'Decrease text size'},'A−'),
        React.createElement('button',{onClick:()=>setTextScale(v=>Math.min(1.5,+(v+.1).toFixed(2))),'aria-label':'Increase text size'},'A+'),
        React.createElement('button',{onClick:()=>setAgreementOpen(false),'aria-label':'Close full agreement'},'Close')
      )
    ),
    React.createElement('div',{className:'agreement-status'},
      React.createElement('strong',null,'Ready to sign'),
      React.createElement('span',null,'Exact contract text from Final Revision 01. The disclosed payment schedule is included before execution.')
    ),
    agreementLoading&&!agreementData&&React.createElement('p',{className:'agreement-loading'},'Loading full agreement…'),
    agreementData&&React.createElement('article',{className:'agreement-document'},agreementData.blocks.map((b,i)=>React.createElement(AgreementBlock,{block:b,index:i,key:i}))),
    React.createElement('div',{className:'agreement-download-bar'},React.createElement('button',{onClick:downloadPDF},'Download PDF'),React.createElement('button',{onClick:downloadWord},'Download Word'))
  )
))));
}

createRoot(document.getElementById('root')).render(React.createElement(App));
