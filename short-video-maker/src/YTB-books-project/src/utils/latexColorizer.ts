/**
 * LaTeX Variable Colorizer
 * 3B1B 스타일 변수별 색상 코딩 — EpisodeOrchestrator에서 분리 (v12.2)
 *
 * n8n 패턴: 순수 함수 유틸 — 어디서든 import 가능
 */

/**
 * LaTeX 수식의 단일 변수/그리스 문자에 \textcolor{#hex}{var} 래핑 적용
 * 이미 \textcolor가 포함된 수식은 그대로 반환 (중복 방지)
 */
export function colorizeLatex(
  latex: string,
  variableColors: Record<string, string>
): string {
  if (latex.includes('\\textcolor')) return latex;

  const colorValues = Object.values(variableColors);
  let colorIndex = 0;
  const seenVars = new Set<string>();

  const getColor = (varName: string): string => {
    const color = variableColors[varName] || colorValues[colorIndex % colorValues.length];
    if (!seenVars.has(varName)) {
      seenVars.add(varName);
      colorIndex++;
    }
    return color;
  };

  const greekLetters = [
    'alpha', 'beta', 'gamma', 'delta', 'theta', 'lambda',
    'sigma', 'pi', 'mu', 'nu', 'omega', 'epsilon', 'phi', 'psi', 'rho', 'tau'
  ];

  const tokens: string[] = [];
  let i = 0;
  while (i < latex.length) {
    // Backslash command
    if (latex[i] === '\\') {
      const cmdMatch = latex.slice(i).match(/^\\([a-zA-Z]+)/);
      if (cmdMatch) {
        const cmd = cmdMatch[1];
        if (greekLetters.includes(cmd)) {
          const color = getColor(cmd);
          tokens.push(`\\textcolor{${color}}{\\${cmd}}`);
        } else {
          tokens.push(`\\${cmd}`);
        }
        i += cmdMatch[0].length;
        continue;
      }
      tokens.push(latex[i]);
      i++;
      continue;
    }

    // Brace group
    if (latex[i] === '{') {
      let depth = 1;
      let j = i + 1;
      while (j < latex.length && depth > 0) {
        if (latex[j] === '{') depth++;
        else if (latex[j] === '}') depth--;
        j++;
      }
      const block = latex.slice(i, j);
      const inner = block.slice(1, -1);
      if (inner.length === 1 && /^[a-z]$/.test(inner)) {
        const color = getColor(inner);
        tokens.push(`{\\textcolor{${color}}{${inner}}}`);
      } else {
        tokens.push(block);
      }
      i = j;
      continue;
    }

    // Standalone lowercase letter (single variable)
    if (/[a-z]/.test(latex[i])) {
      const prev = i > 0 ? latex[i - 1] : '';
      const next = i < latex.length - 1 ? latex[i + 1] : '';
      const prevIsAlpha = /[a-zA-Z]/.test(prev);
      const nextIsAlpha = /[a-zA-Z]/.test(next);
      if (!prevIsAlpha && !nextIsAlpha) {
        const color = getColor(latex[i]);
        tokens.push(`\\textcolor{${color}}{${latex[i]}}`);
        i++;
        continue;
      }
    }

    tokens.push(latex[i]);
    i++;
  }

  return tokens.join('');
}
