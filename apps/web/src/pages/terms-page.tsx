import { Link } from 'react-router-dom';
import { BrandLogo } from '@/components/ui/brand';
import { Card } from '@/components/ui/card';

const SUPPORT_EMAIL = 'langdaihoc.work@gmail.com';
const SITE_URL = 'https://langdaihoc.xyz';
const EFFECTIVE_DATE = '05/08/2026';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="scroll-mt-24 space-y-2">
      <h2 className="text-base font-bold text-[var(--color-ink)]">{title}</h2>
      <div className="space-y-2 text-sm leading-6 text-[var(--color-muted)]">{children}</div>
    </section>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="font-semibold text-[var(--color-ink)]">{children}</strong>;
}

function EmailLink() {
  return (
    <a
      href={`mailto:${SUPPORT_EMAIL}`}
      className="font-medium text-brand-orange-dark underline-offset-2 hover:underline"
    >
      {SUPPORT_EMAIL}
    </a>
  );
}

export function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-1 py-2 sm:px-0">
      <div className="flex justify-center py-2 lg:hidden">
        <BrandLogo showSlogan />
      </div>

      <Card className="space-y-7 p-5 sm:p-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-orange-dark">
            Điều khoản dịch vụ
          </p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--color-ink)] sm:text-3xl">
            Điều khoản sử dụng
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">
            Có hiệu lực từ ngày {EFFECTIVE_DATE}. Khi truy cập hoặc sử dụng nền tảng{' '}
            <a
              href={SITE_URL}
              className="font-medium text-brand-orange-dark underline-offset-2 hover:underline"
            >
              langdaihoc.xyz
            </a>
            , bạn xác nhận đã đọc, hiểu và đồng ý bị ràng buộc bởi Điều khoản này cùng{' '}
            <Link
              to="/privacy"
              className="font-medium text-brand-orange-dark underline-offset-2 hover:underline"
            >
              Chính sách bảo vệ dữ liệu cá nhân
            </Link>
            .
          </p>
        </header>

        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950">
          <Strong>Tóm tắt:</Strong> langdaihoc là nền tảng kết nối người mua với đối tác quanh Làng
          Đại Học để đặt đồ ăn, giặt đồ và nhận ship hộ. Hợp đồng giao dịch chủ yếu phát sinh giữa
          bạn và đối tác; langdaihoc cung cấp công nghệ, điều phối đơn và hỗ trợ khiếu nại theo phạm
          vi nêu dưới đây.
        </div>

        <Section title="1. Định nghĩa">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <Strong>Nền tảng / langdaihoc:</Strong> website, ứng dụng web và các dịch vụ liên quan
              do ban vận hành langdaihoc cung cấp.
            </li>
            <li>
              <Strong>Người dùng:</Strong> mọi cá nhân truy cập hoặc sử dụng Nền tảng, bao gồm người
              mua và đối tác.
            </li>
            <li>
              <Strong>Người mua:</Strong> tài khoản đặt dịch vụ ăn uống, giặt đồ hoặc nhận ship hộ.
            </li>
            <li>
              <Strong>Đối tác:</Strong> tài khoản bán hàng/giặt đồ hoặc nhận ship hộ đã được duyệt
              hoạt động trên Nền tảng.
            </li>
            <li>
              <Strong>Đơn hàng:</Strong> yêu cầu mua hoặc sử dụng dịch vụ được tạo qua Nền tảng.
            </li>
          </ul>
        </Section>

        <Section title="2. Bản chất dịch vụ">
          <p>
            langdaihoc vận hành nền tảng trung gian công nghệ phục vụ khu vực Làng Đại Học và vùng
            lân cận. Chúng tôi không trực tiếp sản xuất đồ ăn, vận hành tiệm giặt hay thực hiện nhận
            ship hộ, trừ khi có thông báo rõ ràng khác.
          </p>
          <p>
            Việc chấp nhận đơn, chuẩn bị hàng, giao nhận, chất lượng sản phẩm/dịch vụ và thanh toán
            giữa các bên thuộc trách nhiệm chính của người mua và đối tác liên quan, trong phạm vi
            pháp luật và Điều khoản này.
          </p>
        </Section>

        <Section title="3. Điều kiện sử dụng tài khoản">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Bạn phải cung cấp thông tin chính xác, cập nhật và chịu trách nhiệm với hoạt động trên tài khoản của mình.</li>
            <li>Không chia sẻ mật khẩu, OTP hay phiên đăng nhập; báo ngay cho <EmailLink /> nếu nghi ngờ bị truy cập trái phép.</li>
            <li>Mỗi người chỉ nên dùng tài khoản phục vụ mục đích cá nhân hợp pháp; không tạo tài khoản giả hoặc thao túng hệ thống.</li>
            <li>
              Tài khoản đối tác chỉ được mở bán/cung cấp dịch vụ sau khi ban vận hành duyệt. Đăng ký
              chưa đồng nghĩa được phê duyệt.
            </li>
            <li>
              langdaihoc có thể tạm khóa, hạn chế hoặc chấm dứt tài khoản khi có dấu hiệu gian lận,
              vi phạm Điều khoản, gây hại cho người dùng khác hoặc theo yêu cầu pháp luật.
            </li>
          </ul>
        </Section>

        <Section title="4. Quy định dành cho người mua">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Kiểm tra kỹ thông tin sản phẩm, thời gian nhận, địa chỉ và ghi chú trước khi đặt.</li>
            <li>Cung cấp địa chỉ/SĐT nhận hàng chính xác để đối tác liên hệ và giao nhận.</li>
            <li>
              Thanh toán đúng phương thức đã chọn trên đơn (tiền mặt khi nhận hoặc chuyển khoản theo
              thông tin đối tác hiển thị). Hiện Nền tảng không xử lý thẻ ngân hàng trực tuyến.
            </li>
            <li>
              Với chuyển khoản, chỉ chuyển đúng số tiền và nội dung hướng dẫn; tải biên lai khi hệ
              thống yêu cầu để đối tác xác nhận.
            </li>
            <li>
              Không đặt đơn ảo, hủy hàng loạt không lý do chính đáng, hoặc lợi dụng khuyến mãi/khiếu
              nại để trục lợi.
            </li>
          </ul>
        </Section>

        <Section title="5. Quy định dành cho đối tác">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Cập nhật đúng thông tin cửa hàng, sản phẩm, giá, giờ hoạt động, khu vực phục vụ và tình
              trạng nhận đơn.
            </li>
            <li>
              Chỉ đăng nội dung/sản phẩm hợp pháp; không đăng hàng cấm, hàng giả, nội dung xâm phạm
              quyền sở hữu trí tuệ hoặc trái thuần phong mỹ tục.
            </li>
            <li>
              Xử lý đơn trong thời gian hợp lý, thông báo khi từ chối/hủy, và bảo mật thông tin người
              mua chỉ dùng cho mục đích thực hiện đơn.
            </li>
            <li>
              Nếu nhận thanh toán chuyển khoản, cung cấp thông tin tài khoản ngân hàng/QR chính xác
              và xác nhận biên lai trung thực.
            </li>
            <li>
              Tài khoản nhận ship hộ chỉ được tạo/gán theo quy trình nội bộ của ban vận hành; đối
              tác không được tự ý nhận đơn ngoài phạm vi được phép.
            </li>
          </ul>
        </Section>

        <Section title="6. Đặt hàng, hủy và thay đổi">
          <p>
            Đơn hàng được tạo khi bạn hoàn tất bước đặt trên Nền tảng và hệ thống ghi nhận thành
            công. Trạng thái đơn (mới, đang xử lý, hoàn tất, hủy, từ chối…) hiển thị trên tài khoản
            của bạn.
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Người mua có thể hủy đơn trong phạm vi chức năng và điều kiện hệ thống cho phép (ví dụ
              trước khi đối tác xử lý quá xa).
            </li>
            <li>Đối tác có thể từ chối hoặc hủy đơn khi hết hàng, ngoài giờ, sai địa chỉ hoặc trường hợp bất khả kháng, và nên nêu lý do.</li>
            <li>
              Sau khi đơn đã xử lý/giao nhận, việc hoàn tiền hoặc đổi trả (nếu có) do người mua và
              đối tác thỏa thuận; langdaihoc hỗ trợ trung gian khiếu nại theo mục 8.
            </li>
          </ul>
        </Section>

        <Section title="7. Giá, phí và thanh toán">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Giá sản phẩm/dịch vụ do đối tác niêm yết trên Nền tảng tại thời điểm đặt.</li>
            <li>
              Phí nhận ship hộ (nếu có) do đối tác cấu hình và được hiển thị trước khi bạn xác nhận
              đơn.
            </li>
            <li>
              Phương thức thanh toán hiện hỗ trợ: tiền mặt và chuyển khoản ngân hàng. langdaihoc
              không giữ hộ số dư ví và không phải tổ chức trung gian thanh toán.
            </li>
            <li>
              Tranh chấp về số tiền đã chuyển, biên lai hoặc xác nhận thanh toán cần được giải quyết
              giữa người mua và đối tác trước; ban vận hành có thể hỗ trợ dựa trên dữ liệu hệ thống
              khi có khiếu nại.
            </li>
          </ul>
        </Section>

        <Section title="8. Khiếu nại và hỗ trợ">
          <p>
            Nếu phát sinh sự cố về đơn hàng (sai món, chậm giao, chất lượng, thanh toán…), bạn nên
            liên hệ đối tác qua thông tin trên đơn và/hoặc mở khiếu nại trong mục Đơn hàng khi tính
            năng cho phép.
          </p>
          <p>
            Ban vận hành có thể xem xét khiếu nại, yêu cầu bổ sung bằng chứng và đưa hướng xử lý hỗ
            trợ. Kết luận hỗ trợ không tự động tạo nghĩa vụ bồi thường toàn bộ thiệt hại từ phía
            langdaihoc, trừ khi pháp luật bắt buộc hoặc có cam kết bằng văn bản khác.
          </p>
          <p>
            Liên hệ chung: <EmailLink />.
          </p>
        </Section>

        <Section title="9. Nội dung người dùng và sở hữu trí tuệ">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Bạn giữ quyền với nội dung do bạn đăng (ảnh, mô tả, đánh giá, khiếu nại…) và cấp cho
              langdaihoc quyền không độc quyền để hiển thị, lưu trữ và phân phối nội dung đó nhằm vận
              hành Nền tảng.
            </li>
            <li>
              Thương hiệu, giao diện, mã nguồn và tài liệu của langdaihoc thuộc quyền của ban vận
              hành hoặc bên cấp phép; không sao chép, kỹ thuật đảo ngược hoặc khai thác trái phép.
            </li>
            <li>
              Không đăng nội dung xâm hại danh dự, kích động, spam, malware hoặc dữ liệu cá nhân của
              người khác trái pháp luật.
            </li>
          </ul>
        </Section>

        <Section title="10. Hành vi bị cấm">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Can thiệp hệ thống, vượt quyền, quét dữ liệu tự động trái phép hoặc tấn công Nền tảng.</li>
            <li>Giả mạo danh tính, đánh giá ảo, thao túng đơn hàng hoặc thanh toán.</li>
            <li>Sử dụng Nền tảng cho hàng hóa/dịch vụ bất hợp pháp hoặc ngoài phạm vi khu vực phục vụ công bố.</li>
            <li>Thu thập hay tiết lộ dữ liệu cá nhân của người dùng khác ngoài mục đích thực hiện đơn được phép.</li>
          </ul>
        </Section>

        <Section title="11. Tuyên bố miễn trừ và giới hạn trách nhiệm">
          <p>
            Nền tảng được cung cấp trên cơ sở “như hiện có” và “như khả dụng”. Trong phạm vi pháp luật
            cho phép, langdaihoc không bảo đảm dịch vụ không gián đoạn, không lỗi hoặc phù hợp mọi
            nhu cầu riêng.
          </p>
          <p>
            Trong phạm vi pháp luật cho phép, langdaihoc không chịu trách nhiệm về thiệt hại gián
            tiếp, mất lợi nhuận, mất dữ liệu phát sinh từ giao dịch giữa người mua và đối tác, hoặc
            từ việc bạn không tuân thủ Điều khoản. Trách nhiệm tổng của langdaihoc đối với một sự cố
            (nếu có) được giới hạn ở mức hợp lý liên quan đến phí dịch vụ nền tảng bạn đã trả cho sự
            cố đó — hiện nhiều dịch vụ trên Nền tảng không thu phí nền tảng từ người mua.
          </p>
          <p>
            Không điều nào trong Điều khoản loại trừ trách nhiệm bắt buộc theo pháp luật Việt Nam
            (ví dụ trách nhiệm do lỗi cố ý hoặc gian dối).
          </p>
        </Section>

        <Section title="12. Bất khả kháng">
          <p>
            Các bên được miễn trách nhiệm thực hiện nghĩa vụ nếu bị trở ngại do sự kiện bất khả
            kháng như thiên tai, dịch bệnh, mất điện/mạng diện rộng, thay đổi pháp luật hoặc sự cố hạ
            tầng ngoài tầm kiểm soát hợp lý, với điều kiện đã thông báo và khắc phục trong khả năng.
          </p>
        </Section>

        <Section title="13. Thay đổi Điều khoản">
          <p>
            Ban vận hành có thể cập nhật Điều khoản để phù hợp dịch vụ hoặc pháp luật. Bản mới được
            đăng tại trang này kèm ngày hiệu lực. Việc tiếp tục sử dụng Nền tảng sau khi Điều khoản
            mới có hiệu lực được hiểu là bạn chấp nhận bản cập nhật, trừ khi pháp luật yêu cầu hình
            thức đồng ý khác.
          </p>
        </Section>

        <Section title="14. Luật áp dụng và giải quyết tranh chấp">
          <p>
            Điều khoản này được điều chỉnh bởi pháp luật Việt Nam. Tranh chấp liên quan đến việc sử
            dụng Nền tảng được ưu tiên giải quyết thông qua thương lượng; nếu không đạt, có thể đưa
            ra cơ quan có thẩm quyền tại Việt Nam theo quy định pháp luật.
          </p>
        </Section>

        <Section title="15. Liên hệ">
          <p>
            Ban vận hành nền tảng langdaihoc
            <br />
            Email: <EmailLink />
            <br />
            Khu vực hoạt động: Làng Đại Học, Thành phố Hồ Chí Minh, Việt Nam
            <br />
            Website:{' '}
            <a
              href={SITE_URL}
              className="font-medium text-brand-orange-dark underline-offset-2 hover:underline"
            >
              {SITE_URL}
            </a>
          </p>
          <p>
            Xem thêm:{' '}
            <Link
              to="/privacy"
              className="font-medium text-brand-orange-dark underline-offset-2 hover:underline"
            >
              Chính sách bảo vệ dữ liệu cá nhân
            </Link>
            .
          </p>
        </Section>

        <div className="border-t border-[var(--color-line)] pt-4 text-sm">
          <Link
            to="/"
            className="font-semibold text-brand-orange-dark underline-offset-2 hover:underline"
          >
            ← Về trang chủ
          </Link>
        </div>
      </Card>
    </div>
  );
}
