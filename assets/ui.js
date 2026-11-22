/* 올라오는 창(.sheet) 열고 닫기 — base.css 의 .sheet 와 짝이다.
   <button data-sheet="창id">  → 연다
   <button data-close>          → 닫는다 (창 안 어디든)
   창 바깥(어두운 막)을 톡하거나 Esc 를 눌러도 닫힌다.
   열 때 앞의 단추를 기억해 두었다가 닫으면 그리로 초점을 돌려준다. */
(function(){
  "use strict";
  var opener = null;
  function open(id, from){
    var s = document.getElementById(id);
    if (!s) return;
    opener = from || document.activeElement;
    s.hidden = false;
    var x = s.querySelector("[data-close]");
    if (x) x.focus();
  }
  function close(s){
    if (!s || s.hidden) return;
    s.hidden = true;
    if (opener && opener.focus) opener.focus();
    opener = null;
  }
  document.addEventListener("click", function(e){
    var t = e.target;
    var o = t.closest && t.closest("[data-sheet]");
    if (o){ e.preventDefault(); open(o.getAttribute("data-sheet"), o); return; }
    var c = t.closest && t.closest("[data-close]");
    if (c){ close(c.closest(".sheet")); return; }
    if (t.classList && t.classList.contains("sheet")) close(t);
  });
  document.addEventListener("keydown", function(e){
    if (e.key !== "Escape") return;
    var all = document.querySelectorAll(".sheet:not([hidden])");
    if (all.length) close(all[all.length - 1]);
  });
  window.sheet = { open: open, close: function(id){ close(document.getElementById(id)); } };
})();
