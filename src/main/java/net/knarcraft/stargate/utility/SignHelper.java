package net.knarcraft.stargate.utility;

import org.bukkit.DyeColor;
import org.bukkit.block.Sign;
import org.bukkit.block.sign.Side;
import org.jetbrains.annotations.NotNull;
import org.jetbrains.annotations.Nullable;

/**
 * A helper class for dealing with signs
 */
public final class SignHelper {

    private SignHelper() {

    }

    /**
     * Gets the lines of the given sign
     *
     * @param sign <p>The sign to get lines from</p>
     * @return <p>The lines of the sign</p>
     */
    @NotNull
    public static String[] getLines(@NotNull Sign sign) {
        return sign.getSide(Side.FRONT).getLines();
    }

    /**
     * Gets the dye color of the given sign
     *
     * @param sign <p>The sign to check</p>
     * @return <p>The dye currently applied to the sign</p>
     */
    @Nullable
    public static DyeColor getDye(@NotNull Sign sign) {
        return sign.getSide(Side.FRONT).getColor();
    }

    /**
     * Sets the text of a line on a sign
     *
     * @param sign <p>The sign to set text for</p>
     * @param line <p>The line to set</p>
     * @param text <p>The text to set</p>
     */
    public static void setSignLine(@NotNull Sign sign, int line, @NotNull String text) {
        sign.getSide(Side.FRONT).setLine(line, text);
    }

}
