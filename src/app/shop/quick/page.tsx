import { QuickOrderForm } from '@/components/shop/quick-order-form';

/** Quick order pad: paste "size qty" per line. */
export default function QuickOrderPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-lg font-bold">สั่งเร็ว</h1>
        <p className="text-sm text-muted-foreground">พิมพ์หรือวางทีละบรรทัด <span className="font-mono">ขนาด จำนวน</span> ระบบเลือกตัวที่ถูกที่สุดที่มีของพอในขนาดนั้นให้ แก้จำนวนได้ในตะกร้า · สั่งเป็นมัดพิมพ์ <span className="font-mono">2มัด</span> หรือ <span className="font-mono">2มัด5</span> (2 มัด มัดละ 5 เส้น)</p>
      </div>
      <QuickOrderForm />
    </div>
  );
}
