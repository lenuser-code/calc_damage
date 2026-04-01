/*
 * calc_damage.html
 * (ver. 2026.04.01, MBAC ver.B2 1.03a)
 */


/*
 * このスクリプトは、
 *
 *  1. データの羅列
 *  2. 計算
 *  3. コマンド解析
 *  4. 履歴機能
 *  5. インターフェース
 *
 * の５つのパートからなっています。
 */

/*
 * HTMLファイル側でやることは
 *
 *   1. Skills, SP という２つの (連想) 配列にコマンド定義を追加する
 *   2. update() を呼び出す
 *   3. load_history() を呼び出す
 *   4. 必要なら version_text() を使う
 *
 * の４つです。また、フォームは次のように定義されているものとします：
 *
 * promptフォーム
 *   - target
 *   - state
 *   - recipe
 *   - result
 *
 * historyフォーム
 *   - histlist
 */


/*-- 1. データの羅列 --*/

/*
 * 各種定数を設定します。
 * ヒスコハの計算は、これまで通り防御係数を別に用意して行います。
 */

var HP_SETTING = new Array(11400, 8550, 5700, 2850);

var DEF = new Array();
DEF["さつき"] = new Array(100, 90, 90, 80);
DEF["翡翠"] = new Array(85, 95, 92, 90);
DEF["ヒスコハ (翡)"] = new Array(90.9, 101.6, 98.4, 96.3);
DEF["ヒスコハ (琥)"] = new Array(96.3, 96.3, 112, 112);
DEF["都古"] = new Array(102, 90, 90, 90);
DEF["シオン"] = new Array(90, 90, 90, 90);
DEF["シエル"] = new Array(90, 90, 90, 100);
DEF["アルク"] = new Array(88, 90, 85, 80);
DEF["秋葉"] = new Array(92, 85, 80, 80);
DEF["志貴"] = new Array(88, 92, 92, 90);
DEF["七夜"] = new Array(98, 95, 90, 90);
DEF["赤秋葉"] = new Array(110, 110, 110, 100);
DEF["ワルク"] = new Array(90, 100, 100, 90);
DEF["ネロ"] = new Array(88, 85, 85, 80);
DEF["Vシオン"] = new Array(102, 95, 90, 90);
DEF["レン"] = new Array(110, 100, 100, 90);
DEF["白レン"] = new Array(100, 90, 80, 75);
DEF["メカヒスイ"] = new Array(87, 90, 100, 100);
DEF["琥珀"] = new Array(90, 90, 105, 105);
DEF["ワラキア"] = new Array(108, 100, 90, 80);
DEF["紅摩"] = new Array(94, 90, 85, 80);
DEF["青子"] = new Array(100, 90, 90, 85);
DEF["ネコアルク"] = new Array(140, 70, 110, 90);
DEF["ネコカオス"] = new Array(70, 140, 110, 90);

var STATE_COR = new Array();
STATE_COR["STAND"] = 100;
STATE_COR["CROUCH"] = 108;
STATE_COR["FLOAT"] = 88;
STATE_COR["DOWN"] = 42;

var TYPE = new Array();
TYPE.NORMAL = function(c){ Correction = (Correction < c) ? Correction : c; }
TYPE.MULT = function(c){ Correction = Math.floor((Correction * c) / 100); }
TYPE.SUB = function(c){ Correction -= c; }


/*-- 2. 計算 --*/

/*
 * ダメージ計算を行います。
 * 主に proceed() 関数およびその各種ラッパーを使って、１ヒットずつ
 * ダメージを計上していきます。
 */

var HP;
var Guts;
var Defence;
var HC;
var Correction;
var State;
var Offset; /*-- 2026.04.01追加。SETHP用 --*/
var Reduce; /*-- 2026.04.01追加。レデュース用 --*/

init_status = function(){
  HP = HP_SETTING[0];
  HC = 0;
  Correction = 100;
  init_defence();
  init_state();
  Offset = 0;
  Reduce = 0;
}

init_defence = function(){
  var select = document.prompt.target;
  var name = select[select.selectedIndex].text;
  Defence =  DEF[name];
}

init_state = function(){
  var select = document.prompt.state;
  State = select[select.selectedIndex].text;
}

calc_guts = function(){
  if(HP <= 0) return 3;
  if(HP >= HP_SETTING[1]) return 0;
  return 3 - Math.floor(HP / HP_SETTING[3]);
}

calc_hit_cor = function(){
  var x = HC + Guts;
  return (x < 32) ? (100 - 3.125 * x) : 3.125;
}

proceed = function(dmg, cor, cor_type){
  Guts = calc_guts();

  /*-- 2026.04.01追加 --*/
  reduce_coef = 1;
  if(Reduce > 0){
    reduce_coef = 0.7;
    Reduce--;
  }

  dmg = Math.floor((dmg * Defence[Guts]) / 100);
  dmg = Math.floor((dmg * calc_hit_cor()) / 100);
  dmg = Math.floor((dmg * Correction * reduce_coef) / 100);
  dmg = Math.floor((dmg * STATE_COR[State]) / 100);

  HP -= dmg;
  HC++;
  cor_type(cor);
}

proceed_FA = function(dmg, cor, cor_type){
  proceed(dmg, cor, cor_type);
  if(State != "DOWN"){
    State = "FLOAT";
  }
}

// 簡単のために

normal = function(dmg, cor){
  proceed(dmg, cor, TYPE.NORMAL);
}

mult = function(dmg, cor){
  proceed(dmg, cor, TYPE.MULT);
}

sub = function(dmg, cor){
  proceed(dmg, cor, TYPE.SUB);
}

normal_f = function(dmg, cor){
  proceed_FA(dmg, cor, TYPE.NORMAL);
}

mult_f = function(dmg, cor){
  proceed_FA(dmg, cor, TYPE.MULT);
}

sub_f = function(dmg, cor){
  proceed_FA(dmg, cor, TYPE.SUB);
}


/*-- 3. コマンド解析 --*/

/*
 * 入力内容を字句解析して、対応するコマンドを実行します。
 * 簡単のため、入力はすべて大文字に変換します。
 * コマンドの正確な定義は次のようになります：
 *
 *   技名 ::= [\w\+\-\*\[\]@]+
 *   引数 ::= \d+ | \d+\-\d+ | 引数,引数
 *   コマンド ::= 技名 | 技名(引数)
 *   派生技 ::= コマンド>コマンド
 *
 * 派生技 "A(ind)>B" は "A(ind); AB" に置き換えられます。
 * ここで、AB は A と B を連結した文字列を表します。
 */

var CMD_PAT = /^([\w\+\-\*\[\]@]+)(\([\d\-,]+\))?/;
var ARG_PAT = /(\d+\-\d+|\d+)/g;

parse = function(input, pre){
  var name, rest;
  if(input.match(CMD_PAT) == null){
    window.alert("コマンドを解析できません...\n(input = '" + input + "')");
    return;
  }

  name = pre + RegExp.$1.toUpperCase();
  rest = RegExp.rightContext;
  parse_command(name, RegExp.$2.match(ARG_PAT));

  if(rest.length > 0){
    if(rest.charAt(0) == ">"){
      parse(rest.substr(1), name);
    }
    else{
      window.alert("コマンドを解析できません...\n(input = '" + rest + "')");
    }
  }
}

parse_command = function(name, args){
  if(name in Skills){
    parse_attack(name, args);
  }
  else if(name in STATE_COR){
    State = name;
  }
  /*-- 2026.04.01変更 --*/
  else if(name in SP && (args == null || args[0].match(/^\d+$/))){
    SP[name](args != null ? parseInt(args[0]) : null);
  }
  else{
    window.alert("コマンドを解析できません...\n(command = '" + name + "')");
  }
}

// Skillsの処理

parse_range = function(args, ind, max){
  var a, b, i;

  for(i = 0, b = 0; i < args.length; i++){
    if(args[i].match(/(\d+)-(\d+)/)){
      a = parseInt(RegExp.$1); b = parseInt(RegExp.$2);
      for( ; a <= b; ind[ind.length] = a++);
    } else {
      ind[ind.length] = b = parseInt(args[i]);
    }
    if(b > max){ return b; }
  }

  return 0;
}

parse_attack = function(name, args){
  var ind = new Array();
  var i;

  if(args == null){
    for(i = 1; i <= Skills.HC[name]; ind[i-1] = i++);
  } else {
    var r = parse_range(args, ind, Skills.HC[name]);
    if(r > 0){
      window.alert(name + "に" + r + "段目は存在しません... ");
      return;
    }
  }

  for(i = 0; i < ind.length; Skills[name](ind[i++]));
}


/*-- 4. 履歴機能 --*/

/*
 * 実行履歴のための処理を実装します。
 * 履歴は古いものから順に消えていくようにします。
 */

var History = new Array();

save_history = function(maxsize){
  var opts = document.history.histlist.options;
  var hist = make_history();
  var i = History.length;

  if(i >= maxsize){
    opts[0] = null;
    for(i = 0; i < maxsize - 1; i++){
      History[i] = History[i + 1];
    }
  }

  History[i] = hist;
  opts[i] = new Option(hist[3], hist[3]);
}

load_history = function(){
  var i = document.history.histlist.selectedIndex;
  var hist = History[i];
  document.prompt.target.selectedIndex = hist[0];
  document.prompt.state.selectedIndex = hist[1];
  document.prompt.recipe.value = hist[2];
  document.prompt.result.value = hist[3];
  document.history.histlist.selectedIndex = -1;
}

make_history = function(){
  return new Array(
    document.prompt.target.selectedIndex,
    document.prompt.state.selectedIndex,
    document.prompt.recipe.value,
    document.prompt.result.value
  );
}


/*-- 5. インターフェース --*/

/*
 * HTML側から使用されるものです。
 *
 * また、いくつかの特殊コマンドはここで既に定義してしまいます。
 * (State系のコマンドは定義する必要がありません)
 */

var Skills = new Array();
Skills.HC = new Array();
var SP = new Array();

SP["RP"] = function(v){
  TYPE.NORMAL(v);
}

SP["MULT"] = function(v){
  TYPE.MULT(v);
}

SP["COR"] = function(v){
  Correction = v;
}

/*-- 2026.04.01追加 --*/
SP["SETHP"] = function(v){
  if(HC > 0){
    window.alert("SETHPはコンボ開始前に使用します");
  }
  else {
    HP = v;
    Offset = HP_SETTING[0] - v;
  }
}

/*-- 2024.04.01追加 --*/
SP["REDUCE"] = function(v){
  Reduce = v;
}

/*-- 2026.04.01追加 --*/
SP["SHOW_COR"] = function(v){
  window.alert("Correction = " + Correction);
}

update = function(){
  var inputs = document.prompt.recipe.value.replace(/\s+/g, "").match(/[^;]+/g);
  var i;

  init_status();
  for(i = 0; i < inputs.length; i++){
    if(inputs[i].length > 0){
      parse(inputs[i], "");
    }
  }

  document.prompt.result.value = HP_SETTING[0] - HP - Offset;
  save_history(15);
}

version_text = function(){
  return "ver. 2026.04.01";
}
