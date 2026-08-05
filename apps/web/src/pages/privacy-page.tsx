import { Link } from 'react-router-dom';
import { BrandLogo } from '@/components/ui/brand';
import { Card } from '@/components/ui/card';

const SUPPORT_EMAIL = 'langdaihoc.work@gmail.com';
const UPDATED_AT = '05/08/2026';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-bold text-[var(--color-ink)]">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-[var(--color-muted)]">{children}</div>
    </section>
  );
}

export function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-1 py-2 sm:px-0">
      <div className="flex justify-center py-2 lg:hidden">
        <BrandLogo showSlogan />
      </div>

      <Card className="space-y-6 p-5 sm:p-7">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-orange-dark">
            Pháp lý
          </p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--color-ink)]">Chính sách bảo mật</h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Cập nhật lần cuối: {UPDATED_AT}. Chính sách này giải thích cách{' '}
            <strong className="font-semibold text-[var(--color-ink)]">langdaihoc</strong> thu thập,
            sử dụng và bảo vệ thông tin của bạn khi dùng dịch vụ đặt đồ ăn, giặt đồ và nhận ship hộ
            quanh khu Làng Đại Học tại{' '}
            <a href="https://langdaihoc.xyz" className="font-medium text-brand-orange-dark underline-offset-2 hover:underline">
              langdaihoc.xyz
            </a>
            .
          </p>
        </div>

        <Section title="1. Ai chịu trách nhiệm">
          <p>
            Nền tảng langdaihoc do đội vận hành langdaihoc quản lý. Mọi thắc mắc về dữ liệu cá nhân
            gửi về{' '}
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="font-medium text-brand-orange-dark underline-offset-2 hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>
            .
          </p>
        </Section>

        <Section title="2. Thông tin chúng tôi thu thập">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <span className="font-medium text-[var(--color-ink)]">Tài khoản:</span> họ tên, email,
              số điện thoại (nếu có), ảnh đại diện; với đăng nhập Google — thông tin hồ sơ Google mà
              bạn cho phép chia sẻ.
            </li>
            <li>
              <span className="font-medium text-[var(--color-ink)]">Địa chỉ giao nhận:</span> người
              nhận, SĐT, địa chỉ chi tiết, KTX/tòa (nếu có).
            </li>
            <li>
              <span className="font-medium text-[var(--color-ink)]">Đơn hàng:</span> món/dịch vụ đã
              chọn, ghi chú, thời gian nhận/giao, trạng thái đơn, khiếu nại và trao đổi liên quan.
            </li>
            <li>
              <span className="font-medium text-[var(--color-ink)]">Đối tác bán:</span> thông tin cửa
              hàng, sản phẩm, bài đăng, thông tin ngân hàng nhận đối soát (nếu bạn cung cấp).
            </li>
            <li>
              <span className="font-medium text-[var(--color-ink)]">Kỹ thuật:</span> cookie phiên đăng
              nhập, nhật ký truy cập cơ bản (IP, trình duyệt, thời điểm) để bảo mật và vận hành.
            </li>
          </ul>
        </Section>

        <Section title="3. Mục đích sử dụng">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Tạo và quản lý tài khoản, xác minh email, đăng nhập (kể cả Google).</li>
            <li>Xử lý đơn hàng, giao nhận, hỗ trợ khiếu nại giữa bạn và đối tác.</li>
            <li>Gửi thông báo liên quan đơn hàng hoặc bảo mật tài khoản.</li>
            <li>Cải thiện dịch vụ, phát hiện gian lận và bảo vệ hệ thống.</li>
            <li>Tuân thủ yêu cầu pháp luật khi có căn cứ hợp lệ.</li>
          </ul>
          <p>Chúng tôi không bán dữ liệu cá nhân của bạn.</p>
        </Section>

        <Section title="4. Chia sẻ thông tin">
          <p>Thông tin có thể được chia sẻ ở mức cần thiết với:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <span className="font-medium text-[var(--color-ink)]">Đối tác bán / nhận ship:</span>{' '}
              tên, SĐT, địa chỉ và chi tiết đơn để họ thực hiện đơn của bạn.
            </li>
            <li>
              <span className="font-medium text-[var(--color-ink)]">Nhà cung cấp hạ tầng:</span> ví dụ
              lưu trữ xác thực (Supabase), hosting (Vercel/Railway), gửi email giao dịch — chỉ để vận
              hành dịch vụ.
            </li>
            <li>
              <span className="font-medium text-[var(--color-ink)]">Cơ quan có thẩm quyền:</span> khi
              pháp luật yêu cầu.
            </li>
          </ul>
        </Section>

        <Section title="5. Cookie và phiên đăng nhập">
          <p>
            Chúng tôi dùng cookie httpOnly để giữ phiên đăng nhập an toàn trên trình duyệt của bạn.
            Bạn có thể xóa cookie hoặc đăng xuất bất kỳ lúc nào; khi đó một số tính năng sẽ yêu cầu
            đăng nhập lại.
          </p>
        </Section>

        <Section title="6. Lưu trữ và bảo mật">
          <p>
            Dữ liệu được lưu trên hạ tầng đám mây có kiểm soát truy cập. Chúng tôi áp dụng biện pháp
            kỹ thuật hợp lý (mã hóa đường truyền HTTPS, cookie bảo mật, phân quyền tài khoản) nhưng
            không thể cam kết tuyệt đối với mọi rủi ro trên Internet.
          </p>
        </Section>

        <Section title="7. Thời gian lưu giữ">
          <p>
            Chúng tôi giữ thông tin trong thời gian cần thiết để cung cấp dịch vụ, giải quyết tranh
            chấp, đối soát và tuân thủ pháp luật. Bạn có thể yêu cầu xóa hoặc chỉnh sửa hồ sơ theo
            mục dưới đây.
          </p>
        </Section>

        <Section title="8. Quyền của bạn">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Xem và cập nhật hồ sơ, địa chỉ trong mục Tài khoản.</li>
            <li>Đổi hoặc tạo mật khẩu; đăng xuất trên thiết bị đang dùng.</li>
            <li>
              Yêu cầu hỗ trợ chỉnh sửa / xóa tài khoản qua email{' '}
              <a
                href={`mailto:${SUPPORT_EMAIL}`}
                className="font-medium text-brand-orange-dark underline-offset-2 hover:underline"
              >
                {SUPPORT_EMAIL}
              </a>
              .
            </li>
          </ul>
        </Section>

        <Section title="9. Người dùng dưới 16 tuổi">
          <p>
            Dịch vụ hướng tới sinh viên và người dùng quanh Làng Đại Học. Nếu bạn dưới 16 tuổi, hãy
            dùng dịch vụ với sự đồng ý của người giám hộ.
          </p>
        </Section>

        <Section title="10. Thay đổi chính sách">
          <p>
            Chúng tôi có thể cập nhật chính sách này khi dịch vụ thay đổi. Bản mới sẽ đăng trên trang
            này kèm ngày cập nhật. Việc tiếp tục sử dụng sau khi cập nhật đồng nghĩa bạn chấp nhận
            bản mới (trừ khi pháp luật quy định khác).
          </p>
        </Section>

        <Section title="11. Liên hệ">
          <p>
            Email: {SUPPORT_EMAIL}
            <br />
            Khu vực phục vụ: Làng Đại Học, Thủ Đức
            <br />
            Website:{' '}
            <a href="https://langdaihoc.xyz" className="font-medium text-brand-orange-dark underline-offset-2 hover:underline">
              https://langdaihoc.xyz
            </a>
          </p>
        </Section>

        <div className="border-t border-[var(--color-line)] pt-4 text-sm">
          <Link to="/" className="font-semibold text-brand-orange-dark underline-offset-2 hover:underline">
            ← Về trang chủ
          </Link>
        </div>
      </Card>
    </div>
  );
}
