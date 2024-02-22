/*
MIT License

Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
*/

// Remix is giving us a hard time with importing esm modules, so we're copying the code here

// COPIED FROM https://github.com/sindresorhus/humanize-string/blob/main/index.js
// Typescript definitions added by Simon
export function humanizeString(s: string) {
  s = decamelize(s);
  s = s
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
  s = s.charAt(0).toUpperCase() + s.slice(1);

  return s;
}

// COPIED FROM https://github.com/sindresorhus/decamelize/blob/main/index.js
// Typescript definitions added by us
function decamelize(
  text: string,
  { separator = "_", preserveConsecutiveUppercase = false } = {}
) {
  if (!(typeof text === "string" && typeof separator === "string")) {
    throw new TypeError(
      "The `text` and `separator` arguments should be of type `string`"
    );
  }

  // Checking the second character is done later on. Therefore process shorter strings here.
  if (text.length < 2) {
    return preserveConsecutiveUppercase ? text : text.toLowerCase();
  }

  const replacement = `$1${separator}$2`;

  // Split lowercase sequences followed by uppercase character.
  // `dataForUSACounties` → `data_For_USACounties`
  // `myURLstring → `my_URLstring`
  const decamelized = text.replace(
    /([\p{Lowercase_Letter}\d])(\p{Uppercase_Letter})/gu,
    replacement
  );

  if (preserveConsecutiveUppercase) {
    return handlePreserveConsecutiveUppercase(decamelized, separator);
  }

  // Split multiple uppercase characters followed by one or more lowercase characters.
  // `my_URLstring` → `my_ur_lstring`
  return decamelized
    .replace(
      /(\p{Uppercase_Letter})(\p{Uppercase_Letter}\p{Lowercase_Letter}+)/gu,
      replacement
    )
    .toLowerCase();
}

const handlePreserveConsecutiveUppercase = (
  decamelized: string,
  separator: string
) => {
  // Lowercase all single uppercase characters. As we
  // want to preserve uppercase sequences, we cannot
  // simply lowercase the separated string at the end.
  // `data_For_USACounties` → `data_for_USACounties`
  decamelized = decamelized.replace(
    /((?<![\p{Uppercase_Letter}\d])[\p{Uppercase_Letter}\d](?![\p{Uppercase_Letter}\d]))/gu,
    ($0) => $0.toLowerCase()
  );

  // Remaining uppercase sequences will be separated from lowercase sequences.
  // `data_For_USACounties` → `data_for_USA_counties`
  return decamelized.replace(
    /(\p{Uppercase_Letter}+)(\p{Uppercase_Letter}\p{Lowercase_Letter}+)/gu,
    (_: string, $1: string, $2: string) => $1 + separator + $2.toLowerCase()
  );
};
