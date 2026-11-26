export type FormalMode = 'static' | 'normal' | 'clever';

const packCosts = new Map([[20, 20], [60, 50]]);
const dailyCoins = 20;

export function getPreviewRingCount(params: URLSearchParams): number | null {
  const rings = Number(params.get('previewRings'));
  return packCosts.has(rings) ? rings : null;
}

/** P0-L exchange rehearsal. A lobby visit starts with a fresh demo balance. */
export function bindLobbyEntry(
  labels: Record<FormalMode, string>,
  enter: (mode: FormalMode, rings: number) => void,
): void {
  const wallet = document.querySelector<HTMLDialogElement>('#coin-wallet')!;
  const exchange = document.querySelector<HTMLDialogElement>('#ring-exchange')!;
  const form = document.querySelector<HTMLFormElement>('#exchange-form')!;
  const modePicker = document.querySelector<HTMLSelectElement>('#exchange-mode')!;
  const confirm = document.querySelector<HTMLButtonElement>('#confirm-ring-exchange')!;
  const walletClaim = document.querySelector<HTMLButtonElement>('#wallet-claim')!;
  const exchangeWallet = document.querySelector<HTMLButtonElement>('#exchange-wallet')!;
  const title = document.querySelector<HTMLElement>('#exchange-title')!;
  const status = document.querySelector<HTMLElement>('#exchange-status')!;
  const balances = document.querySelectorAll<HTMLElement>('#lobby-coins, #wallet-coins, #exchange-coins');
  let coins = 30;
  let claimed = false;

  function selection() {
    const mode = modePicker.value as FormalMode | '';
    const rings = Number(new FormData(form).get('pack'));
    const cost = packCosts.get(rings)!;
    return { mode, rings, cost, shortfall: Math.max(0, cost - coins) };
  }

  function update(): void {
    const { mode, rings, shortfall } = selection();
    for (const balance of balances) balance.textContent = String(coins);
    walletClaim.disabled = claimed;
    walletClaim.textContent = claimed ? '今日 20 币已领取' : '免费领取今日 20 币';
    exchangeWallet.hidden = shortfall === 0 || claimed;
    title.textContent = mode ? `${labels[mode]} · 换套圈` : '换套圈';
    status.textContent = shortfall
      ? `还差 ${shortfall} 币${claimed ? '，可切换其他档位' : ''}`
      : '';
    confirm.disabled = !mode || shortfall > 0;
    confirm.textContent = mode ? `换 ${rings} 圈并进${labels[mode]}` : '请选择场次';
  }

  function claim(): void {
    if (claimed) return;
    claimed = true;
    coins += dailyCoins;
    update();
  }

  function openExchange(mode: FormalMode | ''): void {
    form.reset();
    modePicker.value = mode;
    update();
    exchange.showModal();
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>('[data-entry-mode]')) {
    button.addEventListener('click', () => openExchange(button.dataset.entryMode as FormalMode));
  }
  document.querySelector('#coin-balance')!.addEventListener('click', () => wallet.showModal());
  const record = document.querySelector<HTMLDialogElement>('#personal-record')!;
  document.querySelector('#open-personal-record')!.addEventListener('click', () => record.showModal());
  document.querySelector('#open-ring-exchange')!.addEventListener('click', () => openExchange(''));
  document.querySelector('#close-ring-exchange')!.addEventListener('click', () => exchange.close());
  walletClaim.addEventListener('click', claim);
  exchangeWallet.addEventListener('click', () => wallet.showModal());
  wallet.addEventListener('close', () => {
    if (exchange.open) (confirm.disabled ? modePicker : confirm).focus();
  });
  form.addEventListener('change', update);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const { mode, rings, cost, shortfall } = selection();
    if (!mode || shortfall || confirm.disabled) return;
    coins -= cost;
    confirm.disabled = true;
    enter(mode, rings);
  });
}
