/**
 * @file
 * calc_damage.jsのコマンド解析をアップデートする (最終更新: 2026.04.03).
 *
 * calc_damage.jsを読み込んだ後にこのファイルを読み込ことで,
 * コマンド解析に関係する部分だけが上書き更新される.
 * これにより構文解析が改良され, さらに次の機能が使えるようになる.
 *
 * - LOOPコマンド
 *   - LOOP(n) { ... } と書くと, 中括弧の中身をｎ回繰り返す.
 *   - 使用例： LOOP(3){ 6A(1)>A>A; AT; } 5A(1); 2B;
 *
 * コードの大部分は newparser というオブジェクトの中に隔離している.
 * 唯一, 以下の3つだけが外部からアクセスできる.
 * - newparser.Parser
 * - update()  (calc_damage.jsの同名の関数を上書き)
 * - version_text()  (calc_damage.jsの同名の関数を上書き)
 *
 * まあ, その辺の細かいことはあまり気にしなくても大丈夫なようにするつもり.
 * あと一応JSDocコメントを付けておくけど, これもざっくり読み飛ばしていいよ.
 * もしパーサーをいじりたい人がいたらそのときに読んでください.
 *
 * @author a7
 */


// #1. newparser

/**
 * 追加される関数やクラスを他のコードから分離するために無名関数でラップする
 *  (「無名関数によるnamespace」とかで調べれば説明が見つかるはず).
 *
 * newparser.Parserだけが外部から直接参照できる.
 * 他の変数は外部からアクセスできないし, 変数名の競合も起こさない.
 * @namespace
 */
var newparser = newparser || {};
(function(newparser){

/**
 * 識別子のパースに使う正規表現.
 * @type {RegExp}
 */
const NAME_PAT = /^([\w\+\-\*\[\]@]+)/;

/**
 * 範囲指定のパースに使う正規表現.
 * @type {RegExp}
 */
const RANGE_PAT = /^(\d+)-(\d+)/;

/**
 * 特殊コマンドの引数のパースに使う正規表現 (括弧を含む).
 * @type {RegExp}
 */
const SINGLE_ARG_PAT = /^\((\d*)\)/;

/**
 * 技コマンドの段数指定のパースに使う正規表現 (括弧を含む).
 * @type {RegExp}
 */
const INDICES_PAT = /^\(([\d\-,]*)\)/;

/**
 * 最初からシステムに組み込まれているコマンド.
 * @class
 * @prop {string} name - このコマンドの識別子
 * @prop {boolean} isState - 状態変化コマンドならばtrue
 */
let PrimitiveCommand = class{
  /**
   * @param {string} name - このコマンドの識別子
   * @param {boolean} [isState=false] - 状態変化コマンドならばtrue
   */
  constructor(name, isState=true){
    this.name = name;
    this.isState = isState;
  }

  /**
   * このコマンドを実行する.
   * @throws {Error} 実行されるはずのないコマンドのとき
   */
  execute(){
    if(this.isState){
      State = this.name;
    }
    else{
      throw new Error(`PrimitiveCommand: 実行されるはずのないトークン "${this.name}" がコマンドとして実行されました`);
    }
  }
}

/**
 * 組み込みコマンドの定義.
 * @namespace
 * @prop {PrimitiveCommand} STAND - 立ち食らいに変更する
 * @prop {PrimitiveCommand} CROUCH - 屈み食らいに変更する
 * @prop {PrimitiveCommand} FLOAT - 空中食らいに変更する
 * @prop {PrimitiveCommand} DOWN - ダウン状態に変更する
 * @prop {PrimitiveCommand} "{" - LOOPコマンドのブロック開始点を表す
 * @prop {PrimitiveCommand} "}" - LOOPコマンドのブロック終了点を表す
 */
const Primitives = Object.freeze({
  STAND: new PrimitiveCommand("STAND"),
  CROUCH: new PrimitiveCommand("CROUCH"),
  FLOAT: new PrimitiveCommand("FLOAT"),
  DOWN: new PrimitiveCommand("DOWN"),
  "{": new PrimitiveCommand("{", false),
  "}": new PrimitiveCommand("}", false)
});

/**
 * 技コマンドを表すクラス.
 * @class
 * @prop {string} name - このコマンドの識別子
 * @prop {number[]} args - 実行する段数のリスト
 */
let AttackCommand = class{
  /**
   * @param {string} name - このコマンドの識別子
   * @param {Parser} parser - パース処理を行うParser
   * @throws {Error} 書式が正しくないとき
   */
  constructor(name, parser){
    this.name = name;
    this.args = parser.parseArgs();
    parser.parseDelim();

    // 引数が省略されたときは全段を指定したものとして扱う
    if(!this.args){
      this.args = [];
      for(let i = 1; i <= Skills.HC[name]; this.args.push(i++));
    }
  }

  /**
   * このコマンドを実行する.
   * @throws {Error} 存在しない段数が指定されているとき
   */
  execute(){
    const HC = Skills.HC[this.name];
    for(let i of this.args){
      if(i > HC){
        throw new Error(`AttackCommand: ${this.name}に${i}段目は存在しません`);
      }
      Skills[this.name](i);
    }
  }
}

/**
 * 特殊コマンドを表すクラス.
 * 技コマンドと違い, 引数は0～1個の整数である. さらに, SP.NO_ARGに明示されていない限り.
 * 引数の省略はできない.
 * @class
 * @prop {string} name - このコマンドの識別子
 * @prop {?number} arg - 実行するコマンドの引数
 */
let SpecialCommand = class{
  /**
   * @param {string} name - このコマンドの識別子
   * @param {Parser} parser - パース処理を行うParser
   * @throws {Error} 書式が正しくないとき
   */
  constructor(name, parser){
    this.name = name;
    this.arg = parser.parseSingleArg();
    parser.parseDelim();
  }

  /**
   * このコマンドを実行する.
   */
  execute(){
    SP[this.name](this.arg);
  }
}

/**
 * ループコマンドを実装する.
 * @class
 * @prop {number} times - ループ回数
 * @prop {Object[]} commands - ブロックを構成するコマンドのリスト
 */
let LoopCommand = class{
  /**
   * @param {Parser} parser - パース処理を行うParser
   * @throws {Error} 書式が正しくないとき
   */
  constructor(parser){
    this.times = parser.parseSingleArg();
    this.commands = [];

    if(!this.times){
      parser.error("LoopCommand: ループ回数が指定されていません");
    }
    if(parser.parse() != Primitives["{"]){
      parser.error("LoopCommand: ブロック開始のカッコがありません");
    }

    while(!parser.isEmpty()){
      const cmd = parser.parse();
      if(cmd == Primitives["}"]){
        if(parser.rest()[0] == ";"){
          parser.parseDelim();
        }
        return;
      }
      this.commands.push(cmd);
    }

    parser.error("LoopCommand: ブロックが閉じていません");
  }

  /**
   * このコマンドを実行する.
   * @throws {Error} ブロック内のコマンド実行に失敗したとき
   */
  execute(){
    for(let n = 0; n < this.times; n++){
      for(let cmd of this.commands){
        cmd.execute();
      }
    }
  }
}

/**
 * コンボレシピをパースしてコマンドオブジェクトを作るクラス.
 * @class
 */
newparser.Parser = class{
  #src;  // パースする前の文字列を保持しておく
  #input;  // パース対象の文字列のうち, まだ処理されていない残りの部分
  #count;  // セミコロンをスキップした回数
  #lastSkillName;  // 派生技の派生元となるコマンド名

  /**
   * inputを解析するパーサーを生成する.
   * 実際には, input自体を直接扱うのではなく
   * 1. inputから空白類を全部削除
   * 2. 行末に1個以上のセミコロンがある場合はこれらを削除
   * 3. アルファベットをすべて大文字に変更
   *
   * という前処理を施した文字列を入力として使う.
   * @param {string} input - パース対象の文字列
   */
  constructor(input){
    this.#src = input;
    this.#input = input.replace(/\s+/g, "").replace(/;+$/, "").toUpperCase();
    this.#count = 0;
    if(this.#input[0] ==";"){
      this.parseDelim();
    }
  }

  /**
   * @returns {boolean} 入力が残っていないときtrue, そうでないときfalse
   */
  isEmpty(){
    return (this.#input.length == 0);
  }

  /**
   * @returns {string} パース対象の文字列のうち, まだ処理されていない残りの部分
   */
  rest(){
    return this.#input;
  }

  /**
   * this.#input の match メソッドを使ってパターンマッチを行い, 
   * もしマッチングに成功, かつ, その開始位置が先頭ならば, this.#input から
   * 該当箇所を取り除く.
   * @param {RegExp} pat - 探索するパターン
   * @returns {Array} matchメソッドの返り値
   */
  #softskip(pat){
    const m = this.#input.match(pat);
    if(m && m.index == 0){
      this.#input = this.#input.slice(m[0].length);
    }
    return m;
  }

  /**
   * 指定されたエラーメッセージを持つ例外を発生させる.
   * このとき, 現在の大まかなパース位置もメッセージに付加する.
   * @param {string} msg - エラーメッセージ
   * @throws {Error} 必ず例外を投げる
   */
  error(msg){
    const lines = this.#src.split(";");
    let info = (this.#count > 0 ? lines[this.#count-1] + ";" : "");
    if(this.#count < lines.length){
      info += lines[this.#count];
      if(this.#count < lines.length - 1){
        info += ";"
      }
    }
    throw new Error(`${msg}\n(input = "${info}")`);
  }

  /**
   * コマンドを1つパースする.
   * @returns {Object} 生成されたコマンドオブジェクト
   * @throws {Error} 書式が正しくないとき
   */
  parse(){
    let prefix = "";
    if(this.#input[0] == ">"){
      if(this.#lastSkillName){
        prefix = this.#lastSkillName;
        this.#input = this.#input.slice(1);
      }
      else{
        this.error("派生技の使い方が正しくありません");
      }
    }

    const m = this.#softskip(NAME_PAT) || this.#softskip(/^([\{\}])/);
    if(m === null){
      this.error("parse: コマンドを解析できません (識別子の書式エラー)");
    }

    const name = prefix + m[1];
    this.#lastSkillName = null;

    if(name == "LOOP"){
      return new LoopCommand(this);
    }
    if(name in Skills){
      this.#lastSkillName = name;
      return new AttackCommand(name, this);
    }
    if(name in Primitives){
      if(name != "{" && name != "}"){
        this.parseDelim();
      }
      return Primitives[name];
    }
    if(name in SP){
      return new SpecialCommand(name, this);
    }
    this.error("parse: コマンドを解析できません (不明な識別子)");
  }

  /**
   * 特殊コマンドの引数をパースする.
   * @returns {?number} パースした結果. ただし, 引数が存在しないときはnull
   * @throws {Error} 引数のパースに失敗したとき
   */
  parseSingleArg(){
    const m = this.#softskip(SINGLE_ARG_PAT);
    if(m === null){
      if(this.#input[0] == "("){
        // 左カッコがあるのにマッチしないのはおかしい
        this.error("parseSingleArgs: 引数のパースに失敗しました");
      }
      return null;
    }
    const num = parseInt(m[1]);
    return (isNaN(num) ? null : num);
  }

  /**
   * 技コマンドの引数をパースする.
   * @returns {?number[]} パースした結果. ただし, 引数が存在しないときはnull
   * @throws {Error} 引数のパースに失敗したとき
   */
  parseArgs(){
    const m = this.#softskip(INDICES_PAT);
    if(m === null){
      if(this.#input[0] == "("){
        // 左カッコがあるのにマッチしないのはおかしい
        this.error("parseArgs: 引数のパースに失敗しました");
      }
      return null;
    }
    return (m[1].length > 0 ? this.parseIndices(m[1].split(",")) : null);
  }

  /**
   * 技コマンドの引数部分をパースして, 段数指定のリストを生成する.
   * @param {string[]} args - 引数部分をカンマで分割したもの
   * @returns {number[]} 実行結果
   * @throws {Error} 段数指定のパースに失敗したとき
   */
  parseIndices(args){
    const ind = [];
    for(const arg of args){
      let exhausted = false;
      const m1 = arg.match(RANGE_PAT);
      const m2 = arg.match(/^(\d+)/);
      if(m1){
        const a = parseInt(m1[1]);
        const b = parseInt(m1[2]);
        for(let i = a; i <= b; ind.push(i++));
        exhausted = (arg.length == m1[0].length);
      }
      else if(m2){
        ind.push(parseInt(m2[1]));
        exhausted = (arg.length == m2[0].length);
      }
      if(!exhausted){
        this.error("parseIndices: 引数のパースに失敗しました");
      }
    }

    const result = Array.from(new Set(ind));
    result.sort( (a,b) => a - b );
    return result;
  }

  /**
   * 連続する1つ以上の区切り文 (セミコロン) を読み飛ばす.
   * ただし, 以下のいずれかに該当するときは何もしない.
   * - 入力が1文字も残っていないとき
   * - 入力の最初の文字が "}" または ">" のとき
   *
   * @throws {Error} セミコロンを読み飛ばせないとき (上記の例外を除く)
   */
  parseDelim(){
    if(this.isEmpty() || this.#input[0] == "}" || this.#input[0] == ">"){
      return;  // これらはエラーにしないほうが自然
    }

    const m = this.#softskip(/^(;+)/);
    if(m === null){
      this.error("parseDelim: セミコロンで区切られていません");
    }
    this.#lastSkillName = null;
    this.#count += m[1].length;
  }
}

})(newparser);


// #2. update, version_text の上書き

/**
 * フォームに入力されたコンボレシピををパースしてダメージ計算を実行する.
 * 結果はフォームに直接反映される. また, 同時に実行履歴も更新する.
 */
update = function(){
  const input = document.prompt.recipe.value;
  const parser = new newparser.Parser(input);

  init_status();
  try{
    while(!parser.isEmpty()){
      const elem = parser.parse();
      elem.execute();
    }
    document.prompt.result.value = HP_SETTING[0] - HP - Offset;
    save_history(15);
  }
  catch(e){
    window.alert(e.message);
  }
}

/**
 * このスクリプトのバージョンを表す文字列を返す.
 * @returns {string} このスクリプトのバージョン表記
 */
version_text = function(){
  return "ver. 2026.04.03";
}
