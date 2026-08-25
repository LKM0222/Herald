import { createHash } from "node:crypto";

/**
 * 기사 주소를 다루는 규칙.
 *
 * collect.ts 와 origin.ts 가 같은 규칙을 써야 해서 따로 뺐다. 한쪽만 바뀌면
 * 원본 주소를 되찾아 놓고도 id 가 어긋나 중복이 그대로 남는다.
 */

/**
 * 주소가 같으면 같은 기사다.
 *
 * ⚠ id 는 **날마다 안 바뀌어야 한다.** seen.ts 가 "이미 요약함" 을 이걸로 기억한다.
 *   id 가 흔들리면 어제 요약한 기사가 오늘 다시 요약된다.
 */
export function idFor(url: string): string {
  return createHash("sha1").update(canonical(url)).digest("hex").slice(0, 16);
}

/** 추적 파라미터와 끝 슬래시를 떼어낸다. 같은 글이 두 주소로 들어오는 걸 막는다. */
export function canonical(url: string): string {
  try {
    const at = new URL(url);
    at.hash = "";
    for (const key of [...at.searchParams.keys()]) {
      if (/^(utm_|ref$|ref_|source$|fbclid$|gclid$)/i.test(key)) {
        at.searchParams.delete(key);
      }
    }
    at.hostname = at.hostname.toLowerCase().replace(/^www\./, "");
    at.pathname = at.pathname.replace(/\/+$/, "") || "/";
    return at.toString();
  } catch {
    return url.trim();
  }
}
