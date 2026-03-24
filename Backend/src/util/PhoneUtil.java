package util;

public final class PhoneUtil {

    private PhoneUtil() {}

    public static String normalizar(String tel) {
        if (tel == null || tel.isBlank()) return "";
        String base = tel.split("@")[0].split(":")[0];
        String clean = base.replaceAll("\\D", "");
        return formatearArgentina(clean);
    }

    private static String formatearArgentina(String clean) {
        if (clean.length() > 10 && !clean.startsWith("0")) {
            if (clean.startsWith("54") && clean.length() == 12 && !clean.startsWith("549")) {
                return "549" + clean.substring(2);
            }
            return clean;
        }
        if (clean.length() == 10) return "549" + clean;
        if (clean.startsWith("0")) {
            String sinCero = clean.substring(1);
            return sinCero.length() == 10 ? "549" + sinCero : clean;
        }
        return clean;
    }
}
