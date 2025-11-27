"use client";
import { useState } from "react";

// Ключевые слова (нельзя использовать как имена переменных)
const KEYWORDS = new Set([
  "var",
  "array",
  "of",
  "integer",
  "real",
  "char",
  "boolean",
  "string"
]);

// Проверка имени идентификатора
const IDENT_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;

// Проверка целого числа (включая отрицательные)
const INTEGER_REGEX = /^-?\d+$/;

/* -----------------------------------------------------------
   ЛЕКСИЧЕСКИЙ АНАЛИЗАТОР (TOKENIZER)
   Разбивает входной текст на токены
----------------------------------------------------------- */
function tokenize(code) {
  const tokens = [];
  let i = 0,
    line = 1,
    col = 1;

  function pushToken(type, value, l = line, c = col) {
    tokens.push({ type, value, line: l, col: c });
  }

  function isAlpha(ch) {
    return /[A-Za-z_]/.test(ch);
  }
  function isAlnum(ch) {
    return /[A-Za-z0-9_]/.test(ch);
  }
  function isDigit(ch) {
    return /[0-9]/.test(ch);
  }

  while (i < code.length) {
    const ch = code[i];

    // Переход на новую строку
    if (ch === "\r") {
      i++;
      if (code[i] === "\n") i++;
      line++;
      col = 1;
      continue;
    }
    if (ch === "\n") {
      i++;
      line++;
      col = 1;
      continue;
    }

    // Пробельные символы
    if (" \t\f\v".includes(ch)) {
      i++;
      col++;
      continue;
    }

    // Комментарии { ... }
    if (ch === "{") {
      const startL = line,
        startC = col;
      i++;
      col++;
      let closed = false;
      while (i < code.length) {
        if (code[i] === "}") {
          i++;
          col++;
          closed = true;
          break;
        }
        if (code[i] === "\n") {
          i++;
          line++;
          col = 1;
          continue;
        }
        if (code[i] === "\r") {
          i++;
          if (code[i] === "\n") i++;
          line++;
          col = 1;
          continue;
        }
        i++;
        col++;
      }
      if (!closed)
        throw {
          type: "lexical",
          line: startL,
          col: startC,
          message: "Незакрытый комментарий"
        };
      continue;
    }

    // Комментарии (* ... *)
    if (ch === "(" && code[i + 1] === "*") {
      const startL = line,
        startC = col;
      i += 2;
      col += 2;
      let closed = false;
      while (i < code.length) {
        if (code[i] === "*" && code[i + 1] === ")") {
          i += 2;
          col += 2;
          closed = true;
          break;
        }
        if (code[i] === "\n") {
          i++;
          line++;
          col = 1;
          continue;
        }
        if (code[i] === "\r") {
          i++;
          if (code[i] === "\n") i++;
          line++;
          col = 1;
          continue;
        }
        i++;
        col++;
      }
      if (!closed)
        throw {
          type: "lexical",
          line: startL,
          col: startC,
          message: "Незакрытый комментарий"
        };
      continue;
    }

    // Двухсимвольные операторы
    if (ch === ":" && code[i + 1] === "=") {
      pushToken("SYMBOL", ":=");
      i += 2;
      col += 2;
      continue;
    }
    if (ch === "." && code[i + 1] === ".") {
      pushToken("SYMBOL", "..");
      i += 2;
      col += 2;
      continue;
    }

    // Отрицательное число (важно обрабатывать до символов)
    if (ch === "-" && isDigit(code[i + 1])) {
      let j = i + 1;
      while (j < code.length && isDigit(code[j])) j++;
      pushToken("NUMBER", code.slice(i, j));
      col += j - i;
      i = j;
      continue;
    }

    // Односимвольные символы
    if (":;.,[]()^@:+-*/<>=".includes(ch)) {
      pushToken("SYMBOL", ch);
      i++;
      col++;
      continue;
    }

    // Положительное число
    if (isDigit(ch)) {
      let j = i;
      while (j < code.length && isDigit(code[j])) j++;
      pushToken("NUMBER", code.slice(i, j));
      col += j - i;
      i = j;
      continue;
    }

    // Идентификаторы / ключевые слова
    if (isAlpha(ch)) {
      let j = i;
      while (j < code.length && isAlnum(code[j])) j++;
      const raw = code.slice(i, j);
      pushToken(KEYWORDS.has(raw.toLowerCase()) ? "KEYWORD" : "IDENT", raw);
      col += j - i;
      i = j;
      continue;
    }

    // Неизвестный символ
    pushToken("UNKNOWN", ch);
    i++;
    col++;
  }

  pushToken("EOF", "");
  return tokens;
}

/* -----------------------------------------------------------
   ОСНОВНАЯ СТРУКТУРА ПАРСЕРА
   Двигается по массиву токенов
----------------------------------------------------------- */
function Parser(tokens) {
  this.tokens = tokens;
  this.pos = 0;
}
Parser.prototype.peek = function () {
  return this.tokens[this.pos];
};
Parser.prototype.next = function () {
  return this.tokens[this.pos++];
};

// Проверка корректности имени переменной
function checkIdent(tok) {
  if (!IDENT_REGEX.test(tok.value) || KEYWORDS.has(tok.value.toLowerCase()))
    throw {
      type: "syntax",
      line: tok.line,
      col: tok.col,
      message: "Недопустимое имя переменной"
    };
}

/* -----------------------------------------------------------
   ПАРСЕР ТИПОВ
----------------------------------------------------------- */
function parseType(parser) {
  const tok = parser.peek();

  if (tok.type === "KEYWORD") {
    const v = tok.value;

    // Простые типы
    if (["integer", "real", "char", "boolean"].includes(v)) {
      parser.next();
      return { kind: v };
    }

    // string и string[10]
    if (v === "string") {
      parser.next();
      const nxt = parser.peek();

      if (nxt.type === "SYMBOL" && nxt.value === "[") {
        parser.next(); // [

        const lenTok = parser.peek();
        if (lenTok.type !== "NUMBER" || !INTEGER_REGEX.test(lenTok.value))
          throw { type: "syntax", line: lenTok.line, col: lenTok.col };

        const size = parseInt(parser.next().value, 10);

        const close = parser.peek();
        if (!(close.type === "SYMBOL" && close.value === "]"))
          throw { type: "syntax", line: close.line, col: close.col };

        parser.next();
        return { kind: "string", size };
      }

      return { kind: "string" };
    }

    // array [...]
    if (v === "array") {
      parser.next();

      const open = parser.peek();
      if (!(open.type === "SYMBOL" && open.value === "[")) {
        throw { type: "syntax", line: open.line, col: open.col };
      }
      parser.next();

      const ranges = [];

      while (true) {
        const fromTok = parser.peek();
        if (fromTok.type !== "NUMBER" || !INTEGER_REGEX.test(fromTok.value)) {
          throw { type: "syntax", line: fromTok.line, col: fromTok.col };
        }
        const from = parseInt(parser.next().value, 10);

        const dots = parser.peek();
        if (!(dots.type === "SYMBOL" && dots.value === "..")) {
          throw { type: "syntax", line: dots.line, col: dots.col };
        }
        parser.next();

        const toTok = parser.peek();
        if (toTok.type !== "NUMBER" || !INTEGER_REGEX.test(toTok.value)) {
          throw { type: "syntax", line: toTok.line, col: toTok.col };
        }
        const to = parseInt(parser.next().value, 10);

        if (from > to)
          throw { type: "syntax", line: fromTok.line, col: fromTok.col };

        ranges.push({ from, to });

        const sep = parser.peek();
        if (sep.type === "SYMBOL" && sep.value === ",") {
          parser.next();
          continue;
        }
        if (sep.type === "SYMBOL" && sep.value === "]") {
          parser.next();
          break;
        }
        throw { type: "syntax", line: sep.line, col: sep.col };
      }

      const ofTok = parser.peek();
      if (!(ofTok.type === "KEYWORD" && ofTok.value === "of")) {
        throw { type: "syntax", line: ofTok.line, col: ofTok.col };
      }
      parser.next();

      const baseType = parseType(parser);
      return { kind: "array", ranges, baseType };
    }
  }

  throw { type: "syntax", line: tok.line, col: tok.col };
}

/* -----------------------------------------------------------
   ПАРСИНГ ОБЪЯВЛЕНИЯ ПЕРЕМЕННЫХ
----------------------------------------------------------- */
function parseDeclaration(parser, declared) {
  const ids = [];

  while (true) {
    const tok = parser.peek();
    if (tok.type !== "IDENT")
      throw { type: "syntax", line: tok.line, col: tok.col };

    checkIdent(tok);

    const name = parser.next().value;
    ids.push({ name, line: tok.line, col: tok.col });

    const sep = parser.peek();
    if (sep.type === "SYMBOL" && sep.value === ",") {
      parser.next();
      continue;
    }
    break;
  }

  const colon = parser.peek();
  if (!(colon.type === "SYMBOL" && colon.value === ":"))
    throw { type: "syntax", line: colon.line, col: colon.col };
  parser.next();

  const typeInfo = parseType(parser);

  const semi = parser.peek();
  if (!(semi.type === "SYMBOL" && semi.value === ";"))
    throw { type: "syntax", line: semi.line, col: semi.col };
  parser.next();

  for (const id of ids) {
    const key = id.name.toLowerCase();
    if (declared.has(key))
      throw {
        type: "syntax",
        line: id.line,
        col: id.col,
        message: `Повторное объявление '${id.name}'`
      };

    declared.set(key, { line: id.line, col: id.col });
  }

  return { ids, typeInfo };
}

/* -----------------------------------------------------------
   ОСНОВНОЙ ПАРСЕР ПРОГРАММЫ
----------------------------------------------------------- */
function parse(tokens) {
  const parser = new Parser(tokens);
  const declared = new Map();

  while (true) {
    const t = parser.peek();
    if (t.type === "EOF") break;

    if (t.type === "KEYWORD" && t.value === "var") {
      parser.next();

      while (true) {
        const look = parser.peek();
        if (look.type === "IDENT") {
          parseDeclaration(parser, declared);
          continue;
        }
        break;
      }
      continue;
    }

    throw { type: "syntax", line: t.line, col: t.col };
  }

  return declared;
}

/* -----------------------------------------------------------
   ФОРМА
----------------------------------------------------------- */
export default function Home() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState("");

  const sample = `var d: array [-10..6, 6..9] of integer;`;

  const checkCode = () => {
    setResult("");

    try {
      const tokens = tokenize(code);
      try {
        parse(tokens);
        setResult("✅ Описание корректное");
      } catch (e) {
        setResult(
          `❗ Синтаксическая ошибка в строке ${e.line}, позиция ${e.col}${
            e.message ? ": " + e.message : ""
          }`
        );
      }
    } catch (e) {
      setResult(
        `❗ Лексическая ошибка в строке ${e.line}, позиция ${e.col}${
          e.message ? ": " + e.message : ""
        }`
      );
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-4">
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-gray-200 p-6 flex flex-col">
        <h1 className="text-2xl font-bold mb-4 text-gray-800 text-center">
          Проверка описания переменных (Pascal)
        </h1>

        <textarea
          className="w-full h-56 p-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none shadow-sm mb-4"
          placeholder="Вставьте код..."
          value={code}
          onChange={(e) => {
            setCode(e.target.value);
            if (!e.target.value.trim()) setResult("");
          }}
        />

        <div className="flex gap-4 justify-center mb-4">
          <button
            onClick={checkCode}
            className="px-6 py-2 bg-blue-600 text-white rounded-xl shadow hover:scale-105 transition"
          >
            Проверить
          </button>

          <button
            onClick={() => {
              setCode(sample);
              setResult("");
            }}
            className="px-4 py-2 bg-gray-200 rounded-xl shadow hover:bg-gray-300"
          >
            Пример
          </button>

          <button
            onClick={() => {
              setCode("");
              setResult("");
            }}
            className="px-4 py-2 bg-red-100 rounded-xl shadow hover:bg-red-200"
          >
            Очистить
          </button>
        </div>

        {result && (
          <pre className="p-4 bg-gray-50 border border-gray-200 rounded-xl shadow-inner whitespace-pre-wrap text-sm overflow-x-auto">
            {result}
          </pre>
        )}
      </div>
    </div>
  );
}
