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

export function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4 px-1 py-2 sm:px-0">
      <div className="flex justify-center py-2 lg:hidden">
        <BrandLogo showSlogan />
      </div>

      <Card className="space-y-7 p-5 sm:p-8">
        <header>
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-orange-dark">
            Quyền riêng tư và dữ liệu cá nhân
          </p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--color-ink)] sm:text-3xl">
            Chính sách bảo vệ dữ liệu cá nhân
          </h1>
          <p className="mt-3 text-sm leading-6 text-[var(--color-muted)]">
            Có hiệu lực từ ngày {EFFECTIVE_DATE}. Chính sách này mô tả một cách minh bạch việc
            langdaihoc thu thập, xử lý, lưu trữ và chia sẻ dữ liệu cá nhân khi bạn truy cập hoặc sử
            dụng nền tảng tại{' '}
            <a
              href={SITE_URL}
              className="font-medium text-brand-orange-dark underline-offset-2 hover:underline"
            >
              langdaihoc.xyz
            </a>
            .
          </p>
        </header>

        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-950">
          <Strong>Tóm tắt:</Strong> langdaihoc chỉ xử lý dữ liệu cần thiết để quản lý tài khoản, kết
          nối người mua với đối tác, thực hiện đơn hàng, thanh toán/chuyển khoản, hỗ trợ khiếu nại và
          bảo vệ hệ thống. Chúng tôi không bán dữ liệu cá nhân và hiện không dùng cookie quảng cáo.
        </div>

        <Section title="1. Phạm vi áp dụng và đơn vị kiểm soát dữ liệu">
          <p>
            Chính sách áp dụng cho người mua, đối tác bán hàng/giặt đồ/nhận ship, người truy cập
            website và người liên hệ hỗ trợ. Trong phạm vi quyết định mục đích và phương thức xử lý,
            <Strong>ban vận hành nền tảng langdaihoc</Strong> là đơn vị kiểm soát dữ liệu cá nhân.
          </p>
          <p>
            Kênh tiếp nhận yêu cầu về dữ liệu cá nhân: <EmailLink />. Khu vực hoạt động: làng đại
            học.
          </p>
        </Section>

        <Section title="2. Dữ liệu được xử lý và nguồn thu thập">
          <p>Chúng tôi có thể xử lý các nhóm dữ liệu sau:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <Strong>Dữ liệu tài khoản:</Strong> họ tên, email, số điện thoại, ảnh đại diện, vai
              trò, trạng thái tài khoản và lý do tạm khóa/từ chối (nếu có). Mật khẩu do Supabase
              Auth quản lý; langdaihoc không lưu mật khẩu dạng đọc được.
            </li>
            <li>
              <Strong>Đăng nhập Google:</Strong> mã định danh tài khoản, email đã xác minh, tên và
              ảnh hồ sơ do Google cung cấp theo phạm vi bạn chấp thuận. Chúng tôi không nhận mật
              khẩu Google.
            </li>
            <li>
              <Strong>Địa chỉ và liên hệ giao nhận:</Strong> tên người nhận, số điện thoại, địa chỉ
              chi tiết, KTX/tòa/phòng hoặc điểm bàn giao.
            </li>
            <li>
              <Strong>Giỏ hàng và đơn hàng:</Strong> sản phẩm/dịch vụ đã chọn, số lượng, tùy chọn,
              giá trị, ghi chú, thời gian, địa chỉ lấy/trả, trạng thái, lý do hủy và lịch sử xử lý.
              Đơn nhận ship có thể gồm mã vận đơn, vị trí lấy hàng, số điện thoại và giá trị kiện
              hàng do bạn khai báo.
            </li>
            <li>
              <Strong>Dữ liệu thanh toán:</Strong> phương thức, trạng thái thanh toán, ảnh biên lai
              chuyển khoản. Đối tác có thể cung cấp tên ngân hàng, số tài khoản, tên chủ tài khoản
              và ảnh QR để nhận thanh toán. Đây có thể là dữ liệu cá nhân nhạy cảm và được áp dụng
              quyền truy cập hạn chế phù hợp.
            </li>
            <li>
              <Strong>Thông tin đối tác, nội dung và hỗ trợ:</Strong> tên/địa chỉ cửa hàng, khu vực
              phục vụ, giờ hoạt động, loại dịch vụ dự kiến, ghi chú đăng ký; bài đăng, hình ảnh,
              đánh giá, nội dung khiếu nại, tin nhắn trao đổi, bằng chứng và kết quả giải quyết.
            </li>
            <li>
              <Strong>Dữ liệu kỹ thuật:</Strong> cookie phiên, thông tin cần thiết để giới hạn tần
              suất/ngăn lạm dụng và nhật ký thao tác quản trị (có thể gồm IP, user-agent và thời
              điểm). langdaihoc không tự xây dựng nhật ký IP/user-agent cho mọi lượt duyệt trang;
              nhà cung cấp hạ tầng có thể tạo log kỹ thuật theo chính sách riêng của họ.
            </li>
          </ul>
          <p>
            Dữ liệu chủ yếu do bạn cung cấp trực tiếp; ngoài ra có thể đến từ Google (khi bạn chọn
            đăng nhập Google), đối tác thực hiện đơn và dữ liệu kỹ thuật tự động phát sinh khi hệ
            thống hoạt động.
          </p>
          <p>
            Vui lòng không đưa dữ liệu sức khỏe, giấy tờ định danh, mật khẩu, mã OTP hoặc thông tin
            không cần thiết vào ghi chú, bài đăng hay nội dung khiếu nại.
          </p>
        </Section>

        <Section title="3. Mục đích và căn cứ xử lý">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Tạo, xác minh, bảo vệ và quản lý tài khoản; hỗ trợ đăng nhập email hoặc Google.</li>
            <li>
              Tiếp nhận, chuyển giao và thực hiện đơn; liên hệ giao nhận; xử lý thanh toán, đối soát,
              hoàn/hủy và khiếu nại.
            </li>
            <li>
              Hiển thị thông tin cửa hàng, sản phẩm, bài đăng hoặc đánh giá mà người dùng chủ động
              công khai.
            </li>
            <li>
              Gửi email xác minh/khôi phục tài khoản và thông báo trong ứng dụng về đơn hàng hoặc
              bảo mật. Hiện hệ thống không gửi email tiếp thị hay email trạng thái đơn.
            </li>
            <li>
              Phân quyền, ghi nhật ký quản trị, phòng chống gian lận, điều tra sự cố và bảo vệ quyền
              lợi hợp pháp của người dùng, đối tác và nền tảng.
            </li>
            <li>Thực hiện nghĩa vụ pháp lý hoặc yêu cầu hợp pháp của cơ quan có thẩm quyền.</li>
          </ul>
          <p>
            Tùy trường hợp, việc xử lý được thực hiện trên cơ sở sự đồng ý của bạn, yêu cầu giao kết/
            thực hiện giao dịch, nghĩa vụ pháp lý hoặc căn cứ khác được pháp luật cho phép. Nếu một
            dữ liệu là bắt buộc để thực hiện đơn hoặc bảo vệ tài khoản, việc không cung cấp có thể
            khiến chức năng tương ứng không hoạt động.
          </p>
        </Section>

        <Section title="4. Dữ liệu công khai và dữ liệu được chuyển cho đối tác">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Hồ sơ cửa hàng, số điện thoại liên hệ cửa hàng, sản phẩm, ảnh, bài đăng và đánh giá có
              thể được hiển thị công khai theo tính năng bạn sử dụng.
            </li>
            <li>
              Đối tác thực hiện đơn được xem thông tin cần thiết như tên, số điện thoại, địa chỉ,
              thời gian và chi tiết đơn. Đối tác chỉ được dùng thông tin đó để thực hiện và hỗ trợ
              đơn hàng.
            </li>
            <li>
              Nội dung khiếu nại và bằng chứng chỉ được cung cấp cho các bên liên quan và quản trị
              viên có thẩm quyền, trừ khi pháp luật yêu cầu khác.
            </li>
          </ul>
          <p>
            Bạn chịu trách nhiệm bảo đảm có quyền cung cấp dữ liệu của người nhận hoặc người liên hệ
            khác và đã thông báo cho họ về mục đích giao nhận.
          </p>
        </Section>

        <Section title="5. Nhà cung cấp dịch vụ và chuyển dữ liệu ra nước ngoài">
          <p>
            Để vận hành nền tảng, dữ liệu có thể được xử lý bởi các nhà cung cấp sau trong phạm vi
            cần thiết:
          </p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              <Strong>Supabase:</Strong> cơ sở dữ liệu, xác thực và lưu trữ ảnh riêng tư;
            </li>
            <li>
              <Strong>Vercel và Railway:</Strong> phân phối website và vận hành máy chủ API;
            </li>
            <li>
              <Strong>Cloudflare R2:</Strong> lưu trữ ảnh công khai khi được cấu hình;
            </li>
            <li>
              <Strong>Resend:</Strong> gửi email xác minh và khôi phục tài khoản;
            </li>
            <li>
              <Strong>Google:</Strong> xác thực khi bạn chủ động chọn “Đăng nhập với Google”.
            </li>
          </ul>
          <p>
            Một số nhà cung cấp có hạ tầng ngoài Việt Nam, vì vậy dữ liệu có thể được lưu trữ hoặc
            truy cập xuyên biên giới. langdaihoc yêu cầu nhà cung cấp xử lý dữ liệu theo mục đích
            dịch vụ và áp dụng biện pháp bảo vệ phù hợp với thỏa thuận và pháp luật áp dụng.
          </p>
          <p>
            Ngoài các trường hợp trên, chúng tôi có thể cung cấp dữ liệu khi có yêu cầu hợp pháp của
            cơ quan nhà nước, để bảo vệ tính mạng/sức khỏe trong tình huống khẩn cấp, hoặc trong
            trường hợp khác mà pháp luật cho phép. Chúng tôi không bán hoặc cho thuê dữ liệu cá nhân.
          </p>
        </Section>

        <Section title="6. Cookie, bộ nhớ trình duyệt và theo dõi">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>
              Cookie httpOnly lưu phiên đăng nhập: access token tối đa 15 phút; refresh token tối đa
              1 ngày, hoặc 7 ngày khi chọn ghi nhớ đăng nhập.
            </li>
            <li>
              Session storage tạm lưu dữ liệu kỹ thuật của luồng Google OAuth (PKCE, đường dẫn quay
              lại, lựa chọn ghi nhớ) và được xóa sau khi hoàn tất hoặc thất bại.
            </li>
            <li>
              Local storage lưu thời điểm ẩn lời nhắc cài ứng dụng và trạng thái đã xem popup; đây
              không phải dữ liệu dùng để quảng cáo theo hành vi.
            </li>
          </ul>
          <p>
            Hiện tại langdaihoc không cài cookie quảng cáo hoặc công cụ phân tích hành vi bên thứ ba.
            Trình duyệt có thể cho phép bạn xóa/chặn cookie, nhưng đăng nhập và một số chức năng sẽ
            không hoạt động đúng.
          </p>
        </Section>

        <Section title="7. Thời hạn lưu trữ">
          <p>Thời hạn hiện được áp dụng như sau:</p>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>Thông báo trong ứng dụng: 7 ngày.</li>
            <li>Khóa chống tạo trùng đơn: 14 ngày.</li>
            <li>Nhật ký thao tác quản trị: 30 ngày.</li>
            <li>
              Biên lai chuyển khoản: dự kiến xóa sau 7 ngày kể từ khi đơn hoàn tất, bị hủy hoặc bị từ
              chối; có thể giữ lâu hơn nếu việc xóa tệp thất bại để hệ thống thử lại an toàn.
            </li>
            <li>
              Các mốc lịch sử trạng thái cũ của đơn đã kết thúc được rút gọn sau 7 ngày; trạng thái
              gần nhất vẫn được giữ cùng đơn.
            </li>
            <li>
              Hồ sơ, địa chỉ, đơn hàng, đánh giá, khiếu nại, cửa hàng và nội dung chính chưa có lịch
              xóa tự động; được giữ khi tài khoản/dịch vụ còn hoạt động hoặc khi cần cho giao dịch,
              đối soát, giải quyết tranh chấp và nghĩa vụ pháp lý.
            </li>
            <li>
              Ảnh bằng chứng khiếu nại hiện chưa có lịch xóa tự động và được giữ cùng hồ sơ khiếu
              nại cho đến khi có yêu cầu hợp lệ hoặc không còn mục đích/căn cứ lưu giữ.
            </li>
            <li>
              Ảnh công khai được giữ đến khi nội dung bị xóa hoặc được thay thế; bản sao lưu/hạ tầng
              phân phối có thể cần thêm thời gian hợp lý để hết hiệu lực.
            </li>
          </ul>
          <p>
            Khi hết mục đích và không còn căn cứ lưu giữ, dữ liệu sẽ được xóa, hủy hoặc khử nhận dạng
            theo khả năng kỹ thuật và quy định pháp luật.
          </p>
        </Section>

        <Section title="8. Biện pháp bảo vệ dữ liệu">
          <p>
            Chúng tôi áp dụng các biện pháp phù hợp với quy mô hệ thống, bao gồm HTTPS, cookie
            httpOnly/secure, phân quyền theo vai trò, kiểm tra phiên phía máy chủ, giới hạn tần suất
            yêu cầu, kiểm soát nguồn truy cập, xác thực URL tệp tải lên, bucket riêng tư và URL ký có
            thời hạn cho biên lai/bằng chứng, cùng nhật ký hoạt động quản trị.
          </p>
          <p>
            Không có hệ thống nào an toàn tuyệt đối. Bạn cần bảo mật thiết bị và thông tin đăng nhập,
            không chia sẻ OTP/mật khẩu và báo ngay qua <EmailLink /> nếu nghi ngờ tài khoản bị truy
            cập trái phép.
          </p>
        </Section>

        <Section title="9. Quyền và nghĩa vụ của bạn">
          <p>
            Theo pháp luật áp dụng, bạn có thể có quyền: được biết; đồng ý hoặc không đồng ý; rút lại
            sự đồng ý; xem, yêu cầu cung cấp hoặc chỉnh sửa; yêu cầu xóa, hạn chế hoặc phản đối xử
            lý; khiếu nại, tố cáo, khởi kiện và yêu cầu bồi thường khi có căn cứ.
          </p>
          <p>
            Bạn có thể tự cập nhật một số dữ liệu trong mục Hồ sơ. Với các yêu cầu khác, gửi email
            từ địa chỉ gắn với tài khoản tới <EmailLink /> và nêu rõ nội dung yêu cầu. Chúng tôi có
            thể yêu cầu xác minh danh tính, phản hồi trong thời hạn luật định và thông báo lý do nếu
            yêu cầu không thể thực hiện toàn bộ (ví dụ dữ liệu phải giữ để giải quyết giao dịch,
            tranh chấp, bảo vệ quyền của người khác hoặc tuân thủ pháp luật).
          </p>
          <p>
            Việc rút lại sự đồng ý không ảnh hưởng đến tính hợp pháp của hoạt động xử lý đã diễn ra
            trước đó. Xóa hoặc hạn chế dữ liệu cần thiết có thể khiến tài khoản hay dịch vụ không
            tiếp tục sử dụng được.
          </p>
          <p>
            Bạn có nghĩa vụ cung cấp thông tin chính xác, tự bảo vệ dữ liệu của mình và tôn trọng dữ
            liệu cá nhân của người khác.
          </p>
        </Section>

        <Section title="10. Dữ liệu của trẻ em">
          <p>
            Dịch vụ được thiết kế chủ yếu cho sinh viên và không chủ đích hướng tới trẻ em. Trường
            hợp người dùng là trẻ em hoặc người có người đại diện theo pháp luật, việc xử lý dữ liệu
            và thực hiện quyền sẽ tuân theo yêu cầu về sự đồng ý/đại diện của pháp luật hiện hành.
            Nếu cho rằng dữ liệu trẻ em được cung cấp không phù hợp, vui lòng liên hệ <EmailLink />.
          </p>
        </Section>

        <Section title="11. Sự cố dữ liệu">
          <p>
            Khi phát hiện sự cố ảnh hưởng đến dữ liệu cá nhân, chúng tôi sẽ đánh giá, cô lập, khắc
            phục và thực hiện nghĩa vụ thông báo cho cơ quan có thẩm quyền hoặc người bị ảnh hưởng
            theo quy định pháp luật, tùy mức độ và tính chất sự cố.
          </p>
        </Section>

        <Section title="12. Cập nhật chính sách">
          <p>
            Chính sách có thể được sửa đổi để phản ánh thay đổi của dịch vụ, nhà cung cấp hoặc pháp
            luật. Phiên bản mới sẽ được đăng tại trang này cùng ngày có hiệu lực. Nếu thay đổi ảnh
            hưởng đáng kể đến quyền hoặc mục đích xử lý, chúng tôi sẽ thông báo hoặc xin lại sự đồng
            ý khi pháp luật yêu cầu.
          </p>
        </Section>

        <Section title="13. Pháp luật áp dụng và liên hệ">
          <p>
            Chính sách được xây dựng theo pháp luật Việt Nam, bao gồm Luật Bảo vệ dữ liệu cá nhân số
            91/2025/QH15 và văn bản hướng dẫn hiện hành.
          </p>
          <p>
            Ban vận hành nền tảng langdaihoc
            <br />
            Email: <EmailLink />
            <br />
            Khu vực hoạt động: làng đại học
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
              to="/terms"
              className="font-medium text-brand-orange-dark underline-offset-2 hover:underline"
            >
              Điều khoản sử dụng
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
