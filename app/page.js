"use client";
import { useState } from "react";

export default function Home() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState("");

  const checkCode = () => {
    const lines = code.split("\n");
    const varDeclRegex =
      /^var\s+([a-zA-Z_]\w*(\s*,\s*[a-zA-Z_]\w*)*)\s*:\s*((integer|real|char|boolean|string(\[\d+\])?)|(array\s*\[\s*\d+\s*\.\.\s*\d+\s*\]\s*of\s*(integer|real|string|char|boolean)))\s*;$/i;

    let declaredVars = new Map();
    let errors = [];

    lines.forEach((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      const match = trimmed.match(varDeclRegex);
      if (!match) {
        const pos = line.search(/\S/);
        errors.push(
          `❗ Ошибка в строке ${i + 1}, позиция ${
            pos + 1
          }: синтаксическая ошибка`
        );
        return;
      }

      const vars = match[1].split(",").map((v) => v.trim());
      for (let v of vars) {
        if (declaredVars.has(v)) {
          const prev = declaredVars.get(v);
          errors.push(
            `❗ Дубликат переменной "${v}" в строке ${i + 1}, позиция ${
              line.indexOf(v) + 1
            }. Ранее объявлена в строке ${prev.line}, позиция ${prev.pos}`
          );
        } else {
          declaredVars.set(v, { line: i + 1, pos: line.indexOf(v) + 1 });
        }
      }
      const strSizeMatch = trimmed.match(/string\[(\d+)\]/i);
      if (strSizeMatch) {
        const size = parseInt(strSizeMatch[1]);
        if (size <= 0 || size > 255) {
          errors.push(
            `❗ Ошибка в строке ${
              i + 1
            }: недопустимый размер строки (${size}). Допустимо от 1 до 255.`
          );
        }
      }

      const arrayMatch = trimmed.match(
        /array\s*\[\s*(\d+)\s*\.\.\s*(\d+)\s*\]/i
      );
      if (arrayMatch) {
        const from = parseInt(arrayMatch[1]);
        const to = parseInt(arrayMatch[2]);
        if (from >= to) {
          errors.push(
            `❗ Ошибка в строке ${
              i + 1
            }: некорректный диапазон массива [${from}..${to}]. Левая граница должна быть меньше правой.`
          );
        }
      }
    });

    let report = "";
    if (errors.length === 0) {
      report = "✅ Описание корректное";
    } else {
      report = errors.join("\n");
    }

    setResult(report);
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setCode(value);
    if (value.trim() === "") setResult("");
  };

  const sample = `var a, b, c: integer;
var d, e: string
var f, a: real;
var s: string[20];
var arr: array[1..5] of real;
var t, s: string[300];
var wrongArr: array[10..5] of integer;`;

  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 p-4">
      <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-gray-200 p-8 flex flex-col">
        <h1 className="text-3xl font-extrabold mb-6 text-gray-800 text-center">
          Проверка описания переменных
        </h1>

        <textarea
          className="w-full h-56 p-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-400 focus:border-transparent shadow-sm resize-none transition-all mb-4"
          placeholder="Вставьте сюда код на Pascal..."
          value={code}
          onChange={handleInputChange}
        />

        <div className="flex gap-4 justify-center mb-6">
          <button
            onClick={checkCode}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 text-white rounded-xl shadow-md hover:scale-105 transform transition-all duration-200"
          >
            Проверить
          </button>
          <button
            onClick={() => {
              setCode(sample);
              setResult("");
            }}
            className="px-6 py-3 bg-gray-200 text-gray-700 rounded-xl shadow-sm hover:bg-gray-300 hover:scale-105 transform transition-all duration-200"
          >
            Вставить пример
          </button>
        </div>

        {result && (
          <pre className="p-4 bg-gray-50 border border-gray-200 rounded-xl shadow-inner whitespace-pre-wrap text-sm overflow-x-auto mb-6">
            {result}
          </pre>
        )}
      </div>
    </div>
  );
}
