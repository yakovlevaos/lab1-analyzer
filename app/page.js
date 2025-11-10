"use client";
import { useState } from "react";

export default function Home() {
  const [code, setCode] = useState("");
  const [result, setResult] = useState("");

  // Регулярное выражение с гибким пробелом/табуляцией
  const varWithDeclRegex =
    /^\s*var\s+([a-zA-Z_]\w*(\s*,\s*[a-zA-Z_]\w*)*)\s*:\s*(((integer|real|char|boolean|string)(\s*\[\s*\d+\s*\])?)|(array\s*\[\s*(\d+\s*\.\.\s*\d+)(\s*,\s*\d+\s*\.\.\s*\d+)*\]\s*of\s*(integer|real|string|char|boolean)))\s*;\s*$/i;
  const declInsideBlockRegex =
    /^\s*([a-zA-Z_]\w*(\s*,\s*[a-zA-Z_]\w*)*)\s*:\s*(((integer|real|char|boolean|string)(\s*\[\s*\d+\s*\])?)|(array\s*\[\s*(\d+\s*\.\.\s*\d+)(\s*,\s*\d+\s*\.\.\s*\d+)*\]\s*of\s*(integer|real|string|char|boolean)))\s*;\s*$/i;

  const checkCode = () => {
    // Разобьем исходный код на физические строки
    const rawLines = code.split("\n");

    // Собираем логические объявления переменных со всеми пробелами и табуляцией в строках
    const logicalLines = [];
    let buffer = "";

    for (let rawLine of rawLines) {
      // Уберем только переносы строк, сохраним пробелы и табы
      let line = rawLine.replace(/\r/g, "").trimRight();

      // Объединяем строки в buffer до появления ';'
      if (buffer) {
        buffer += " " + line.trimLeft();
      } else {
        buffer = line;
      }

      if (buffer.includes(";")) {
        // Полное объявление собрали
        logicalLines.push(buffer);
        buffer = "";
      }
    }
    // если что осталось незавершенное, добавим как есть
    if (buffer.trim() !== "") {
      logicalLines.push(buffer);
    }

    let declaredVars = new Map();
    let errors = [];
    let insideVarBlock = false;

    logicalLines.forEach((line, idx) => {
      const trimmed = line.trim();

      if (!insideVarBlock) {
        // Проверка строки с var и объявлением
        if (varWithDeclRegex.test(trimmed)) {
          insideVarBlock = true;
          const match = trimmed.match(varWithDeclRegex);
          checkVars(match[1], idx + 1, trimmed);

          checkAdditionalChecks(trimmed, idx + 1);
        } else {
          errors.push(
            `❗ Ошибка в строке ${
              idx + 1
            }: ожидалось объявление с ключевым словом var`
          );
        }
      } else {
        // Проверка объявлений внутри блока var без var в строке
        if (declInsideBlockRegex.test(trimmed)) {
          const match = trimmed.match(declInsideBlockRegex);
          checkVars(match[1], idx + 1, trimmed);

          checkAdditionalChecks(trimmed, idx + 1);
        } else {
          // Любая строка, не подходящая под объявление, завершает блок
          insideVarBlock = false;
          // Но эту строку пересмотреть следующим итератором (пересчет индекса)
          errors.push(
            `❗ Ошибка в строке ${
              idx + 1
            }: синтаксическая ошибка объявления переменных внутри блока var`
          );
        }
      }
    });

    function checkVars(varsStr, lineNum, lineText) {
      const vars = varsStr.split(",").map((v) => v.trim());
      for (let v of vars) {
        if (declaredVars.has(v)) {
          const prev = declaredVars.get(v);
          errors.push(
            `❗ Дубликат переменной "${v}" в строке ${lineNum}, позиции ${
              lineText.indexOf(v) + 1
            }. Ранее объявлена в строке ${prev.line}, позиции ${prev.pos}`
          );
        } else {
          declaredVars.set(v, { line: lineNum, pos: lineText.indexOf(v) + 1 });
        }
      }
    }

    function checkAdditionalChecks(line, lineNum) {
      // Проверка размера string[n]
      const strSizeMatch = line.match(/string\s*\[\s*(\d+)\s*\]/i);
      if (strSizeMatch) {
        const size = parseInt(strSizeMatch[1]);
        if (size <= 0 || size > 255) {
          errors.push(
            `❗ Ошибка в строке ${lineNum}: недопустимый размер строки (${size}). Допустимо от 1 до 255.`
          );
        }
      }
      // Проверка массива с несколькими измерениями
      const arrayMatch = line.match(
        /array\s*\[\s*(\d+\s*\.\.\s*\d+(\s*,\s*\d+\s*\.\.\s*\d+)*)\s*\]/i
      );
      if (arrayMatch) {
        const ranges = arrayMatch[1].split(/\s*,\s*/);
        for (let range of ranges) {
          const [fromStr, toStr] = range.split(/\s*\.\.\s*/);
          const from = parseInt(fromStr);
          const to = parseInt(toStr);
          if (from >= to) {
            errors.push(
              `❗ Ошибка в строке ${lineNum}: некорректный диапазон массива [${from}..${to}]. Левая граница должна быть меньше правой.`
            );
          }
        }
      }
    }

    setResult(
      errors.length === 0 ? "✅ Описание корректное" : errors.join("\n")
    );
  };

  const handleInputChange = (e) => {
    setCode(e.target.value);
    if (e.target.value.trim() === "") setResult("");
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
