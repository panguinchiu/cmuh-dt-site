import { CHOICES, CHOICE_DESC, CHOICE_LABEL, PAYOFF } from "@/lib/game";

/** 學員頁開頭：情境、三種選擇、收益矩陣、規則（不含任何帶領者內容） */
export function GameIntro() {
  return (
    <>
      <section className="card">
        <div className="kicker">情境</div>
        <p>
          一家虛構醫學中心的<b>內科隊</b>與<b>外科隊</b>領導團隊，共用有限的加護病房床位。接下來八個月，每月月初兩隊各自、同時決定本系這個月的協作投入等級。
        </p>
        <p>
          目標：讓自己這一隊八個月累計的「<b>重症收治量能點數</b>」愈高愈好，不需要為對方負責。兩系過去因床位分配、轉床爭議與績效歸屬有過摩擦，關係略為緊張；醫療部並未授權私下協調。為了避免臨時喬床、影響公平，醫療部規定兩隊必須每月月初同時決定、同時亮牌。
        </p>
      </section>

      <section className="grid c3">
        {CHOICES.map((c) => (
          <div key={c} className="card tight">
            <span className={`chip ${c}`}>{CHOICE_LABEL[c]}</span>
            <p style={{ marginTop: "calc(8px * var(--z))", marginBottom: 0 }}>{CHOICE_DESC[c]}</p>
          </div>
        ))}
      </section>

      <section className="grid c2" style={{ marginTop: "calc(18px * var(--z))", alignItems: "start", marginBottom: "calc(6px * var(--z))" }}>
        <div className="card">
          <h3>收益矩陣</h3>
          <p className="muted small">每格為「內科, 外科」本回合點數</p>
          <div className="tscroll">
            <table className="tbl">
              <thead>
                <tr>
                  <th>內科↓ ／ 外科→</th>
                  {CHOICES.map((c) => (
                    <th key={c}>{CHOICE_LABEL[c]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {CHOICES.map((m) => (
                  <tr key={m}>
                    <td>
                      <span className={`chip ${m}`}>{CHOICE_LABEL[m]}</span>
                    </td>
                    {CHOICES.map((s) => (
                      <td key={s} className="mono">
                        {PAYOFF[m][s][0]}, {PAYOFF[m][s][1]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h3>規則</h3>
          <ul style={{ margin: 0, paddingLeft: "calc(20px * var(--z))" }}>
            <li>共 8 回合，兩隊每回合同時亮牌。</li>
            <li>
              第 4 回合分數 <b>×2</b>、第 8 回合 <b>×3</b>（已自動套用）。
            </li>
            <li>第 1–3 回合不得交談。</li>
            <li>第 4、第 7 回合開始前，各有 2 分鐘雙邊會談（可承諾，不具約束力）。</li>
            <li>每隊各填自己那一欄，兩隊都出牌才計分；同組任一成員填寫即可。</li>
          </ul>
        </div>
      </section>
    </>
  );
}
