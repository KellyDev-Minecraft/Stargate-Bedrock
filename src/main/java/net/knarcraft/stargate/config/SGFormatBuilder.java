package net.knarcraft.stargate.config;

import net.knarcraft.knarlib.formatting.FormatBuilder;
import net.knarcraft.stargate.Stargate;
import org.jetbrains.annotations.NotNull;

/**
 * A customized format builder for automatic translation of Stargate messages
 */
public class SGFormatBuilder extends FormatBuilder {

    /**
     * Instantiates a new format builder
     */
    public SGFormatBuilder() {
        super();
    }

    /**
     * Instantiates a new format builder
     *
     * <p>If the input is a list, it will be joined using the default delimiter: ",".</p>
     *
     * @param input <p>The input to use as the initial string of this format builder</p>
     * @throws IllegalStateException <p>If the string formatter has not been set, and the input is a translatable message</p>
     */
    public <K> SGFormatBuilder(@NotNull K input) throws IllegalStateException {
        super(input);
    }

    @Override
    @NotNull
    protected <K> String asString(@NotNull K input, @NotNull String delimiter) {
        if (input instanceof Message message) {
            return Stargate.getStargateConfig().getLanguageLoader().getString(message);
        }
        return super.asString(input, delimiter);
    }

}
